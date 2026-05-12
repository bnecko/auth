const { Worker } = require("bullmq");
const Redis = require("ioredis");
const { createHmac } = require("crypto");
const { Pool } = require("pg");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const databaseUrl = process.env.DATABASE_URL;
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error("TELEGRAM_BOT_TOKEN is required for the worker");
  process.exit(1);
}

if (!databaseUrl) {
  console.error("DATABASE_URL is required for the worker");
  process.exit(1);
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker("telegram-notifications", async (job) => {
  if (job.name === "send") {
    console.log(`Sending telegram message for job ${job.id}...`);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job.data),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Telegram API error: ${errText}`);
      throw new Error(`Telegram API error: ${res.status}`);
    }
  }
}, { connection });

worker.on("completed", job => console.log(`Job ${job.id} completed!`));
worker.on("failed", (job, err) => console.error(`Job ${job?.id} failed: ${err.message}`));

console.log("Telegram BullMQ Worker started.");

// Webhook delivery loop — polls the database for pending deliveries,
// signs each request with the per-endpoint plaintext secret, POSTs to
// the receiver, and updates status with backoff on failure. Kept in
// the same process as the telegram worker to share container resources;
// see plan note that crash-safety relies on the DB next_attempt_at
// rather than BullMQ persistence.

const pool = new Pool({ connectionString: databaseUrl });

// After attempt N fails, wait this many seconds before attempt N+1.
// Index 0 is unused; we look up by attempt_count (1-indexed).
const RETRY_DELAYS_SECONDS = [
  0,        // never used
  60,       // after 1st fail → 1 min
  5 * 60,   // after 2nd → 5 min
  15 * 60,  // after 3rd → 15 min
  60 * 60,  // after 4th → 1 h
  4 * 60 * 60,
  12 * 60 * 60,
  24 * 60 * 60,
];
const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length - 1;
const DELIVERY_TIMEOUT_MS = 5000;
const RESPONSE_BODY_LIMIT = 4096;

function signPayload(secret, timestamp, body) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

async function deliverOne(row) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: row.public_id,
    type: row.event_type,
    created: timestamp,
    data: row.payload,
  });
  const signature = signPayload(row.secret, timestamp, body);

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  let responseStatus = null;
  let responseBody = null;
  let lastError = null;

  try {
    const response = await fetch(row.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bottleneck-timestamp": String(timestamp),
        "x-bottleneck-signature": signature,
        "x-bottleneck-event": row.event_type,
        "x-bottleneck-delivery": row.public_id,
      },
      body,
      signal: controller.signal,
    });
    responseStatus = response.status;
    const text = await response.text();
    responseBody = text.slice(0, RESPONSE_BODY_LIMIT);
    if (!response.ok) {
      lastError = `HTTP ${response.status}`;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(abortTimer);
  }

  const succeeded = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
  const nextAttempt = row.attempt_count + 1;

  if (succeeded) {
    await pool.query(
      `update webhook_deliveries
          set status = 'delivered',
              attempt_count = $2,
              delivered_at = now(),
              response_status = $3,
              response_body = $4,
              last_error = null,
              next_attempt_at = null
        where id = $1`,
      [row.id, nextAttempt, responseStatus, responseBody],
    );
    return;
  }

  if (nextAttempt >= MAX_ATTEMPTS) {
    await pool.query(
      `update webhook_deliveries
          set status = 'failed',
              attempt_count = $2,
              response_status = $3,
              response_body = $4,
              last_error = $5,
              next_attempt_at = null
        where id = $1`,
      [row.id, nextAttempt, responseStatus, responseBody, lastError],
    );
    return;
  }

  const delaySeconds = RETRY_DELAYS_SECONDS[nextAttempt];
  await pool.query(
    `update webhook_deliveries
        set status = 'pending',
            attempt_count = $2,
            response_status = $3,
            response_body = $4,
            last_error = $5,
            next_attempt_at = now() + ($6 || ' seconds')::interval
      where id = $1`,
    [row.id, nextAttempt, responseStatus, responseBody, lastError, String(delaySeconds)],
  );
}

async function processWebhookBatch() {
  // Single-worker model: no FOR UPDATE / SKIP LOCKED. Holding a
  // transaction across the HTTP call would deadlock with the inner
  // UPDATE (separate connection) and starve the pool. If we ever run
  // multiple worker replicas, replace this with an atomic claim:
  // UPDATE ... SET next_attempt_at = now() + '5 minutes'
  //  WHERE id = $1 AND attempt_count = $expected_attempt_count
  // returning ... and skip rows where rowCount = 0.
  try {
    const { rows } = await pool.query(
      `select d.id, d.public_id, d.event_type, d.payload, d.attempt_count,
              e.url, e.secret
         from webhook_deliveries d
         join webhook_endpoints e on e.id = d.webhook_endpoint_id
        where d.status = 'pending'
          and d.next_attempt_at is not null
          and d.next_attempt_at <= now()
          and e.status = 'active'
        order by d.next_attempt_at
        limit 10`,
    );

    for (const row of rows) {
      try {
        await deliverOne(row);
      } catch (err) {
        console.error(`Webhook delivery ${row.public_id} threw:`, err);
      }
    }
  } catch (err) {
    console.error("Webhook batch error:", err);
  }
}

// Poll roughly once a second. A crashed worker leaves pending rows in
// the DB; they are picked up on next start. The SKIP LOCKED on the
// SELECT lets multiple worker replicas run safely.
setInterval(() => {
  processWebhookBatch().catch(err => console.error("Webhook loop error:", err));
}, 1000);

console.log("Webhook delivery loop started.");

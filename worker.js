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
  // Atomic claim: a single UPDATE reserves up to 10 pending rows by
  // pushing next_attempt_at five minutes into the future, then
  // returns the payload + endpoint metadata needed to deliver. Two
  // concurrent ticks (we run setInterval at 1s; a slow batch can
  // overlap with the next tick) cannot reserve the same row because
  // SKIP LOCKED gives each one a disjoint set. If a worker crashes
  // mid-delivery the row's next_attempt_at unblocks naturally five
  // minutes later — which is far longer than any HTTP attempt's
  // 5-second AbortController timeout.
  try {
    const { rows } = await pool.query(
      `update webhook_deliveries d
          set next_attempt_at = now() + interval '5 minutes'
         from webhook_endpoints e
        where d.id in (
                select id
                  from webhook_deliveries
                 where status = 'pending'
                   and next_attempt_at is not null
                   and next_attempt_at <= now()
                 order by next_attempt_at
                 limit 10
                 for update skip locked
              )
          and e.id = d.webhook_endpoint_id
          and e.status = 'active'
        returning d.id, d.public_id, d.event_type, d.payload, d.attempt_count,
                  e.url, e.secret`,
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
// the DB; they are picked up on next start.
setInterval(() => {
  processWebhookBatch().catch(err => console.error("Webhook loop error:", err));
}, 1000);

console.log("Webhook delivery loop started.");

// Hourly DB hygiene sweep. These tables grow without bound otherwise:
//   - oauth_client_assertion_jtis: every private_key_jwt exchange inserts one
//   - registration_requests: holds password hashes for incomplete signups
//   - webhook_deliveries: failed and delivered rows accumulate forever
// The deletes are scoped so an in-flight retry / fresh signup / recent
// delivery is never affected.
async function sweepHygiene() {
  try {
    await pool.query(
      `delete from oauth_client_assertion_jtis
        where expires_at < now() - interval '1 hour'`,
    );
    await pool.query(
      `delete from registration_requests
        where (
                status in ('pending', 'expired', 'cancelled')
                and expires_at < now() - interval '1 day'
              )
           or (
                status in ('verified', 'completed')
                and expires_at < now() - interval '30 days'
              )`,
    );
    await pool.query(
      `delete from webhook_deliveries
        where status in ('delivered', 'failed', 'cancelled')
          and created_at < now() - interval '30 days'`,
    );
  } catch (err) {
    console.error("Hygiene sweep error:", err);
  }
}

setInterval(() => {
  sweepHygiene().catch(err => console.error("Hygiene loop error:", err));
}, 60 * 60 * 1000);
// Run once at startup so the first sweep doesn't wait an hour.
sweepHygiene().catch(err => console.error("Initial hygiene sweep error:", err));

console.log("DB hygiene sweep started.");

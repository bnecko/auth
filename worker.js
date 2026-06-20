const { Worker } = require("bullmq");
const Redis = require("ioredis");
const { createHmac } = require("crypto");
const { Pool } = require("pg");
const { lookup } = require("dns/promises");
const { isIP } = require("net");
const logger = require("./worker-log.js");

// Operator alert (plain JS; the worker cannot import the TS webhookAlerts
// service). Auto-disable transitions fire exactly once per endpoint, so no
// rate limit is needed here. Best-effort, never throws.
async function sendOperatorAlert(text) {
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID || process.env.BEARER_ADMIN_TELEGRAM_ID;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token || process.env.NODE_ENV !== "production") return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    logger.error("operator_alert_failed", { error: err });
  }
}

// Graceful-shutdown state. On SIGTERM/SIGINT we stop scheduling new work,
// let the in-flight delivery batch drain (bounded), then close the pool and
// redis so a deploy does not sever connections mid-write.
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || 10000);
let isShuttingDown = false;
let inFlightBatches = 0;
const intervalIds = [];
let bullWorker = null;
let bullConnection = null;

// SSRF guard. Webhook URLs are user-supplied; refuse anything pointing at
// localhost, RFC1918, link-local, cloud metadata, etc. Resolve-then-fetch
// leaves a small DNS-rebinding window which we accept for now because the
// outbound traffic is bounded by a 5-second connection timeout.
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "ip6-localhost",
  "ip6-loopback",
]);

function isBlockedIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    return isBlockedIpv4(lower.slice("::ffff:".length));
  }
  return false;
}

function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "ip6-localhost" || hostname === "ip6-loopback") {
    return true;
  }
  if (hostname === "::1") return true;
  return isIP(hostname) === 4 && hostname.startsWith("127.");
}

async function assertWebhookUrlIsSafe(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("webhook url is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("webhook url protocol is not supported");
  }
  const hostname = url.hostname.toLowerCase();
  // Outside production, allow delivery to loopback so local receivers
  // (and the delivery test fixture) work. The deployed worker runs with
  // NODE_ENV=production, where loopback stays blocked as an SSRF target.
  if (process.env.NODE_ENV !== "production" && isLoopbackHostname(hostname)) {
    return;
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("webhook hostname is not allowed");
  }
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    if (isBlockedIpv4(hostname)) throw new Error("webhook ip is not allowed");
    return;
  }
  if (ipVersion === 6) {
    if (isBlockedIpv6(hostname)) throw new Error("webhook ip is not allowed");
    return;
  }
  const records = await lookup(hostname, { all: true });
  for (const record of records) {
    const blocked = record.family === 6 ? isBlockedIpv6(record.address) : isBlockedIpv4(record.address);
    if (blocked) {
      throw new Error("webhook url resolves to a blocked address");
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;

// Webhook delivery loop — polls the database for pending deliveries,
// signs each request with the per-endpoint plaintext secret, POSTs to
// the receiver, and updates status with backoff on failure. Kept in
// the same process as the telegram worker to share container resources;
// see plan note that crash-safety relies on the DB next_attempt_at
// rather than BullMQ persistence.

// Small explicit pool: the worker only polls + sweeps, so it does not need
// the default 10 connections. Keeping it small protects the Postgres
// connection budget when multiple worker replicas run.
const pool = new Pool({ connectionString: databaseUrl, max: 5 });

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
// Disable an endpoint after this many deliveries fail in a row (a
// success resets the count), so a dead receiver stops accruing retries.
const AUTO_DISABLE_THRESHOLD = 5;

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
    await assertWebhookUrlIsSafe(row.url);
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
      redirect: "manual",
    });
    responseStatus = response.status;
    if (response.status >= 300 && response.status < 400) {
      lastError = `unexpected redirect: ${response.status}`;
      responseBody = "";
    } else {
      const text = await response.text();
      responseBody = text.slice(0, RESPONSE_BODY_LIMIT);
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
      }
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
    await pool.query(
      `update webhook_endpoints set consecutive_failures = 0 where id = $1`,
      [row.webhook_endpoint_id],
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
    await disableEndpointIfFailing(row);
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

// A delivery just exhausted its retries. Count it against the endpoint
// and, once enough have failed back-to-back, disable the endpoint so a
// dead receiver stops generating retry load. The update is scoped to
// active endpoints so the transition (and its security event) fire
// exactly once.
async function disableEndpointIfFailing(row) {
  const { rows } = await pool.query(
    `update webhook_endpoints
        set consecutive_failures = consecutive_failures + 1,
            status = case when consecutive_failures + 1 >= $2 then 'disabled' else status end,
            disabled_at = case when consecutive_failures + 1 >= $2 then now() else disabled_at end
      where id = $1 and status = 'active'
      returning status, consecutive_failures`,
    [row.webhook_endpoint_id, AUTO_DISABLE_THRESHOLD],
  );
  const endpoint = rows[0];
  if (endpoint && endpoint.status === "disabled") {
    await pool.query(
      `insert into security_events (event_type, result, metadata)
       values ('webhook_endpoint_auto_disabled', 'disabled', $1::jsonb)`,
      [
        JSON.stringify({
          webhookEndpointId: row.webhook_endpoint_id,
          deliveryPublicId: row.public_id,
          consecutiveFailures: endpoint.consecutive_failures,
        }),
      ],
    );
    logger.warn("webhook_endpoint_auto_disabled", {
      endpointId: row.webhook_endpoint_id,
      consecutiveFailures: endpoint.consecutive_failures,
    });
    await sendOperatorAlert(
      `<b>Webhook endpoint auto-disabled</b>\nendpoint #${row.webhook_endpoint_id} after ${endpoint.consecutive_failures} consecutive failures`,
    );
  }
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
                  d.webhook_endpoint_id, e.url, e.secret`,
    );

    for (const row of rows) {
      try {
        await deliverOne(row);
      } catch (err) {
        logger.error("webhook_delivery_threw", { deliveryId: row.public_id, error: err });
      }
    }
  } catch (err) {
    logger.error("webhook_batch_error", { error: err });
  }
}

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
    // Sessions: revoked or expired for over an hour. Active sessions (not
    // revoked, not past expiry) never match.
    await pool.query(
      `delete from sessions
        where (revoked_at is not null or expires_at < now())
          and coalesce(revoked_at, expires_at) < now() - interval '1 hour'`,
    );
    // OAuth authorization codes: consumed or expired for over an hour.
    await pool.query(
      `delete from oauth_authorization_codes
        where (consumed_at is not null or expires_at < now())
          and coalesce(consumed_at, expires_at) < now() - interval '1 hour'`,
    );
    // OAuth access tokens: revoked or expired for over an hour.
    await pool.query(
      `delete from oauth_access_tokens
        where (revoked_at is not null or expires_at < now())
          and coalesce(revoked_at, expires_at) < now() - interval '1 hour'`,
    );
    // OAuth refresh tokens: keep a 30-day grace past revocation/expiry so the
    // rotation chain remains available for reuse detection within a token's
    // own lifetime, then purge (covers rotated/replaced rows too, so the chain
    // does not grow without bound).
    await pool.query(
      `delete from oauth_refresh_tokens
        where (revoked_at is not null or expires_at < now())
          and coalesce(revoked_at, expires_at) < now() - interval '30 days'`,
    );
    // Pushed authorization requests: expired or consumed for over an hour.
    await pool.query(
      `delete from oauth_pushed_requests
        where expires_at < now() - interval '1 hour'
           or (consumed_at is not null and consumed_at < now() - interval '1 hour')`,
    );
    // Device codes: terminal and expired for over an hour.
    await pool.query(
      `delete from oauth_device_codes
        where status in ('expired', 'consumed', 'denied')
          and expires_at < now() - interval '1 hour'`,
    );
    // Telegram login challenges: terminal and expired for over an hour.
    await pool.query(
      `delete from telegram_login_challenges
        where status in ('verified', 'expired', 'cancelled')
          and expires_at < now() - interval '1 hour'`,
    );
    // Activation requests: terminal, kept 7 days so an integrator can still
    // poll the final status after the user decided or it lapsed.
    await pool.query(
      `delete from activation_requests
        where status in ('approved', 'denied', 'expired', 'cancelled')
          and expires_at < now() - interval '7 days'`,
    );
    // Profile change requests: pending ones hold a proposed username/email
    // until Telegram approval; drop dead pending rows after a day and terminal
    // rows after a week.
    await pool.query(
      `delete from profile_change_requests
        where (status = 'pending' and expires_at < now() - interval '1 day')
           or (status in ('approved', 'denied', 'expired', 'cancelled')
               and expires_at < now() - interval '7 days')`,
    );
    // Security events: 90-day audit retention, bounded per sweep so a large
    // backlog drains over several hourly runs instead of one long transaction.
    await pool.query(
      `delete from security_events
        where id in (
          select id from security_events
           where created_at < now() - interval '90 days'
           order by id
           limit 5000
        )`,
    );
  } catch (err) {
    logger.error("hygiene_sweep_error", { error: err });
  }
}

// Transition pending activations past their expiry to 'expired' and
// enqueue an activation.expired webhook for every active endpoint
// subscribed to it. One statement so the state change and the delivery
// enqueue commit together; gen_random_uuid keeps the delivery public_id
// in the same shape the app's enqueue path produces. Apps that rely on
// webhooks instead of polling otherwise never learn an activation lapsed.
async function sweepExpiredActivations() {
  try {
    const { rows } = await pool.query(
      `with expired as (
         update activation_requests
            set status = 'expired'
          where status = 'pending' and expires_at <= now()
         returning public_id, external_app_id, scopes
       ),
       app_info as (
         select x.public_id, x.external_app_id, x.scopes, a.public_id as app_public_id
           from expired x
           join external_apps a on a.id = x.external_app_id
       ),
       enqueued as (
         insert into webhook_deliveries (public_id, webhook_endpoint_id, event_type, payload, next_attempt_at)
         select 'whd_' || replace(gen_random_uuid()::text, '-', ''),
                ep.id,
                'activation.expired',
                jsonb_build_object(
                  'id', ai.public_id,
                  'status', 'expired',
                  'appId', ai.app_public_id,
                  'scopes', to_jsonb(ai.scopes),
                  'expiredAt', now()
                ),
                now()
           from app_info ai
           join webhook_endpoints ep
             on ep.external_app_id = ai.external_app_id
            and ep.status = 'active'
            and 'activation.expired' = any(ep.event_types)
         returning id
       )
       select (select count(*) from expired)::int as expired_count,
              (select count(*) from enqueued)::int as enqueued_count`,
    );
    const expiredCount = rows[0] ? rows[0].expired_count : 0;
    const enqueuedCount = rows[0] ? rows[0].enqueued_count : 0;
    if (expiredCount > 0) {
      logger.info("activations_expired", { expiredCount, enqueuedCount });
    }
  } catch (err) {
    logger.error("activation_expiry_sweep_error", { error: err });
  }
}

// Fail the boot, not the first job: the worker cannot run without its
// database and bot token, so assert them up front instead of crashing deep
// in the first delivery. The web app validates its own larger secret set
// in lib/server/config.ts; the worker container only receives and needs
// these two (see docker-compose worker service), so it does not assert the
// OIDC/CSRF/Turnstile secrets it never uses.
function validateConfig() {
  const required = ["DATABASE_URL", "TELEGRAM_BOT_TOKEN"];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`missing required environment variables: ${missing.join(", ")}`);
  }
}

// Wires up the Redis-backed telegram worker and the DB poll loops. Kept
// behind a require.main guard so the delivery functions can be imported
// by tests without opening a Redis connection or starting the timers.
// Runs a periodic job while tracking it as in-flight so graceful shutdown can
// wait for it to finish. Skips scheduling once shutdown has begun.
function runBatch(fn, errorEvent) {
  if (isShuttingDown) return;
  inFlightBatches += 1;
  fn()
    .catch(err => logger.error(errorEvent, { error: err }))
    .finally(() => {
      inFlightBatches -= 1;
    });
}

async function shutdownGracefully(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("worker_shutdown_start", { signal, inFlightBatches });
  for (const id of intervalIds) clearInterval(id);
  try {
    if (bullWorker) await bullWorker.close();
  } catch (err) {
    logger.error("worker_close_failed", { error: err });
  }
  const deadline = Date.now() + GRACEFUL_SHUTDOWN_TIMEOUT_MS;
  while (inFlightBatches > 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (inFlightBatches > 0) {
    logger.warn("worker_shutdown_timeout", { inFlightBatches });
  }
  try {
    await pool.end();
  } catch (err) {
    logger.error("pool_end_failed", { error: err });
  }
  try {
    if (bullConnection) await bullConnection.quit();
  } catch (err) {
    logger.error("redis_quit_failed", { error: err });
  }
  logger.info("worker_shutdown_complete", { signal });
  process.exit(0);
}

function startWorker() {
  validateConfig();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  bullConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  bullWorker = new Worker("telegram-notifications", async (job) => {
    if (job.name === "send") {
      logger.debug("telegram_job_send", { jobId: job.id });
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job.data),
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error("telegram_api_error", { status: res.status, body: errText });
        throw new Error(`Telegram API error: ${res.status}`);
      }
    }
  }, { connection: bullConnection });

  bullWorker.on("completed", job => logger.debug("telegram_job_completed", { jobId: job.id }));
  bullWorker.on("failed", (job, err) => logger.error("telegram_job_failed", { jobId: job?.id, error: err }));
  logger.info("telegram_worker_started");

  // Poll roughly once a second. A crashed worker leaves pending rows in
  // the DB; they are picked up on next start.
  intervalIds.push(setInterval(() => runBatch(processWebhookBatch, "webhook_loop_error"), 1000));
  logger.info("webhook_delivery_loop_started");

  intervalIds.push(setInterval(() => runBatch(sweepHygiene, "hygiene_loop_error"), 60 * 60 * 1000));
  // Run once at startup so the first sweep doesn't wait an hour.
  runBatch(sweepHygiene, "initial_hygiene_sweep_error");
  logger.info("hygiene_sweep_started");

  // Activations carry a short TTL (minutes), so sweep every minute to
  // fire activation.expired close to the actual lapse.
  intervalIds.push(setInterval(() => runBatch(sweepExpiredActivations, "activation_sweep_loop_error"), 60 * 1000));
  runBatch(sweepExpiredActivations, "initial_activation_sweep_error");
  logger.info("activation_expiry_sweep_started");

  process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
  process.on("SIGINT", () => shutdownGracefully("SIGINT"));
}

if (require.main === module) {
  startWorker();
}

module.exports = {
  deliverOne,
  processWebhookBatch,
  sweepExpiredActivations,
  signPayload,
  RETRY_DELAYS_SECONDS,
  MAX_ATTEMPTS,
  AUTO_DISABLE_THRESHOLD,
};

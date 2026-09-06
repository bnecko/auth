// Daily operator digest. Its job is as much liveness as content: the digest
// arriving every day at DIGEST_HOUR_UTC is the signal that the worker, the
// database, and the alert channel are all alive, so its absence is itself
// the alert. Counts come from tables the service already writes; nothing is
// instrumented for this.

const DIGEST_WINDOW_SECONDS = 36 * 3600;

function formatUptime(ms) {
  const minutes = Math.floor(ms / 60000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

async function buildDailyDigest(pool, { redis, startedAt, now = Date.now } = {}) {
  const [events, deliveries, endpoints, users] = await Promise.all([
    pool.query(
      `select event_type, count(*)::int as count
         from security_events
        where created_at > now() - interval '24 hours'
        group by event_type
        order by count desc, event_type
        limit 12`,
    ),
    pool.query(
      `select count(*) filter (where status = 'delivered' and delivered_at > now() - interval '24 hours')::int as delivered,
              count(*) filter (where status = 'failed' and created_at > now() - interval '24 hours')::int as failed,
              count(*) filter (where status = 'cancelled' and created_at > now() - interval '24 hours')::int as cancelled,
              count(*) filter (where status = 'pending' and next_attempt_at < now() - interval '10 minutes')::int as overdue
         from webhook_deliveries`,
    ),
    pool.query(
      `select count(*) filter (where status = 'active')::int as active,
              count(*) filter (where status = 'disabled' and disabled_at > now() - interval '24 hours')::int as disabled_today
         from webhook_endpoints`,
    ),
    pool.query(
      `select count(*)::int as total,
              count(*) filter (where created_at > now() - interval '24 hours')::int as new_today,
              count(*) filter (where deletion_requested_at is not null)::int as pending_deletion
         from users`,
    ),
  ]);

  const day = new Date(now()).toISOString().slice(0, 10);
  let alertsSent = "n/a";
  if (redis) {
    try {
      alertsSent = (await redis.get(`alerts:sent:${day}`)) || "0";
    } catch {
      // Redis down is itself reported by the worker; the digest still goes out.
    }
  }

  const d = deliveries.rows[0];
  const e = endpoints.rows[0];
  const u = users.rows[0];
  const lines = [
    `Daily digest auth.bneck.com (${day} UTC)`,
    `worker up ${startedAt ? formatUptime(now() - startedAt) : "n/a"}, alerts sent today: ${alertsSent}`,
    `users: ${u.total} total, ${u.new_today} new, ${u.pending_deletion} pending deletion`,
    `webhooks: ${d.delivered} delivered, ${d.failed} failed, ${d.cancelled} cancelled, ${d.overdue} overdue; endpoints ${e.active} active, ${e.disabled_today} disabled today`,
    "events (24h):",
    ...(events.rows.length
      ? events.rows.map(row => `  ${row.event_type} ${row.count}`)
      : ["  none"]),
  ];
  return lines.join("\n");
}

// Runs on an hourly tick; the hour gate plus the 36h NX window on
// `digest:<day>` yields exactly one send per UTC day regardless of restarts.
async function sendDailyDigest({ pool, alerts, redis, hourUtc, startedAt, now = Date.now }) {
  const current = new Date(now());
  if (current.getUTCHours() !== hourUtc) return false;
  const day = current.toISOString().slice(0, 10);
  const text = await buildDailyDigest(pool, { redis, startedAt, now });
  return alerts.send(`digest:${day}`, text, { windowSeconds: DIGEST_WINDOW_SECONDS });
}

module.exports = { buildDailyDigest, sendDailyDigest, DIGEST_WINDOW_SECONDS };

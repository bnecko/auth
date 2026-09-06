import {
  CHECK_NAMES,
  HEARTBEAT_SOURCES,
  evaluateDiscovery,
  evaluateHeartbeat,
  evaluateReady,
  formatEvent,
  formatSummary,
  sameState,
  transition,
  type CheckName,
  type CheckState,
  type HeartbeatSource,
  type ProbeResult,
} from "./logic";

// Secrets are set with `wrangler secret put` and are not in wrangler.jsonc,
// so `wrangler types` cannot see them; they are merged into the generated
// global Env here (the generated `Env` extends its own base interface, not
// Cloudflare.Env, so the augmentation has to target `Env` itself).
declare global {
  interface Env {
    PING_TOKEN: string;
    TELEGRAM_BOT_TOKEN: string;
    ALERT_TELEGRAM_CHAT_ID: string;
  }
}

const PROBE_TIMEOUT_MS = 10_000;
const TELEGRAM_TIMEOUT_MS = 5_000;
const encoder = new TextEncoder();

function log(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, message, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// Hash both sides to a fixed length, then compare in constant time, so the
// comparison cost does not depend on where the strings first differ.
async function tokenMatches(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function isHeartbeatSource(value: string): value is HeartbeatSource {
  return (HEARTBEAT_SOURCES as readonly string[]).includes(value);
}

async function handlePing(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const match = /^\/ping\/([a-z]+)$/.exec(url.pathname);
  if (request.method !== "GET" || !match || !isHeartbeatSource(match[1])) {
    return new Response("not found", { status: 404 });
  }
  if (!env.PING_TOKEN) {
    log("error", "ping_token_unset");
    return new Response("monitor not configured", { status: 503 });
  }
  const token = url.searchParams.get("token") ?? "";
  if (!(await tokenMatches(token, env.PING_TOKEN))) {
    return new Response("not found", { status: 404 });
  }
  await env.DB.prepare(
    `insert into heartbeats (name, last_seen_at) values (?1, ?2)
     on conflict (name) do update set last_seen_at = excluded.last_seen_at`,
  )
    .bind(match[1], Date.now())
    .run();
  return new Response(null, { status: 204 });
}

// Our own endpoints return small JSON documents; reading them whole is fine.
async function probe(url: string): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "user-agent": "auth-monitor/1 (+cloudflare-worker)" },
    });
    return { status: res.status, body: await res.text() };
  } catch {
    return null;
  }
}

async function sendTelegram(env: Env, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.ALERT_TELEGRAM_CHAT_ID, text }),
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`telegram sendMessage failed: ${res.status}`);
}

type HeartbeatRow = { name: string; last_seen_at: number };

async function runChecks(env: Env, now: number): Promise<void> {
  const base = env.TARGET_BASE_URL;
  const graceMs = Number(env.HEARTBEAT_GRACE_SECONDS) * 1000;
  const failuresToAlert = Number(env.HTTP_FAILURES_TO_ALERT);

  const [ready, discovery, heartbeats, stored] = await Promise.all([
    probe(`${base}/api/health/ready`),
    probe(`${base}/.well-known/openid-configuration`),
    env.DB.prepare("select name, last_seen_at from heartbeats").all<HeartbeatRow>(),
    env.DB.prepare("select name, status, since, failures, detail from checks").all<CheckState>(),
  ]);
  const lastSeen = new Map(heartbeats.results.map(r => [r.name, r.last_seen_at]));
  const previous = new Map(stored.results.map(s => [s.name, s]));

  const verdicts: Record<CheckName, { verdict: ReturnType<typeof evaluateReady>; threshold: number }> = {
    http_ready: { verdict: evaluateReady(ready), threshold: failuresToAlert },
    http_discovery: { verdict: evaluateDiscovery(discovery, base), threshold: failuresToAlert },
    heartbeat_worker: { verdict: evaluateHeartbeat(lastSeen.get("worker") ?? null, now, graceMs), threshold: 1 },
    heartbeat_bot: { verdict: evaluateHeartbeat(lastSeen.get("bot") ?? null, now, graceMs), threshold: 1 },
  };

  const writes: D1PreparedStatement[] = [];
  const messages: string[] = [];
  const states: CheckState[] = [];
  const upsert = env.DB.prepare(
    `insert into checks (name, status, since, failures, detail) values (?1, ?2, ?3, ?4, ?5)
     on conflict (name) do update set status = excluded.status, since = excluded.since,
       failures = excluded.failures, detail = excluded.detail`,
  );

  for (const name of CHECK_NAMES) {
    const prev = previous.get(name) ?? null;
    const { verdict, threshold } = verdicts[name];
    const { next, event } = transition(prev, name, verdict, now, threshold);
    states.push(next);
    if (!sameState(prev, next)) {
      writes.push(upsert.bind(next.name, next.status, next.since, next.failures, next.detail));
    }
    if (event) messages.push(formatEvent(event, next, prev?.since ?? null, now));
  }

  if (writes.length > 0) await env.DB.batch(writes);

  const day = new Date(now).toISOString().slice(0, 10);
  if (new Date(now).getUTCHours() === Number(env.SUMMARY_HOUR_UTC)) {
    const inserted = await env.DB.prepare(
      "insert or ignore into monitor_state (key, value) values (?1, '1')",
    )
      .bind(`summary:${day}`)
      .run();
    if (inserted.meta.changes > 0) messages.push(formatSummary(states, now));
  }

  for (const text of messages) {
    try {
      await sendTelegram(env, text);
    } catch (err) {
      log("error", "telegram_send_failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  log("info", "checks_run", {
    states: Object.fromEntries(states.map(s => [s.name, s.status])),
    events: messages.length,
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handlePing(request, env);
    } catch (err) {
      log("error", "ping_failed", { error: err instanceof Error ? err.message : String(err) });
      return new Response("error", { status: 500 });
    }
  },

  async scheduled(_controller, env): Promise<void> {
    await runChecks(env, Date.now());
  },
} satisfies ExportedHandler<Env>;

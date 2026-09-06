// The /status command: probe each layer between a user and the service and
// say which one failed, the way Cloudflare's error page points at the
// browser, the edge, or the origin. Pure apart from the injected fetch, so it
// is unit-testable; index.js supplies the URLs.

const PROBE_TIMEOUT_MS = 5_000;
const CLOUDFLARE_STATUS_URL = "https://www.cloudflarestatus.com/api/v2/status.json";

export function isStatusCommand(text) {
  return /^\/status(?:@\w+)?(?:\s|$)/.test(text || "");
}

// Only the alert group, or the admin in a private chat, may ask: the reply
// names internal components and the bot is reachable by anyone on Telegram.
export function mayRequestStatus(message, { alertChatId, adminTelegramId }) {
  const chatId = String(message.chat?.id ?? "");
  if (alertChatId && chatId === String(alertChatId)) return true;
  return message.chat?.type === "private" && String(message.from?.id ?? "") === String(adminTelegramId);
}

async function probeJson(fetchImpl, url) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function probeApp(fetchImpl, appUrl) {
  try {
    const { status, body } = await probeJson(fetchImpl, `${appUrl}/api/health/ready`);
    const parts = Object.entries(body?.checks ?? {}).map(([name, up]) => `${name} ${up ? "ok" : "down"}`);
    const detail = parts.length > 0 ? parts.join(", ") : "no detail";
    return {
      ok: status === 200 && body?.ok === true,
      detail: status === 200 ? detail : `${status}, ${detail}`,
    };
  } catch (err) {
    return { ok: false, detail: `unreachable (${err.message})` };
  }
}

async function probeTunnel(fetchImpl, readyUrl) {
  if (!readyUrl) return { ok: null, detail: "not configured" };
  try {
    const { status, body } = await probeJson(fetchImpl, readyUrl);
    const connections = Number(body?.readyConnections ?? 0);
    return {
      ok: status === 200 && connections > 0,
      detail: `${connections} edge connection${connections === 1 ? "" : "s"}`,
    };
  } catch (err) {
    return { ok: false, detail: `unreachable (${err.message})` };
  }
}

const NO_EXTERNAL = { checks: {}, heartbeats: {} };

async function probeExternal(fetchImpl, statusUrl) {
  if (!statusUrl) return { ok: null, detail: "not configured", ...NO_EXTERNAL };
  try {
    const { status, body } = await probeJson(fetchImpl, statusUrl);
    if (status !== 200 || !body) return { ok: false, detail: `status ${status}`, ...NO_EXTERNAL };
    const checks = Object.fromEntries((body.checks ?? []).map(c => [c.name, c]));
    // Ages come from the Worker's clock, so a skewed host clock cannot make
    // a fresh heartbeat look stale.
    const heartbeats = Object.fromEntries(
      (body.heartbeats ?? []).map(h => [h.name, Math.max(0, body.now - h.last_seen_at)]),
    );
    return { ok: true, detail: "reachable", checks, heartbeats };
  } catch (err) {
    return { ok: false, detail: `unreachable (${err.message})`, ...NO_EXTERNAL };
  }
}

async function probeCloudflare(fetchImpl) {
  try {
    const { status, body } = await probeJson(fetchImpl, CLOUDFLARE_STATUS_URL);
    const indicator = body?.status?.indicator;
    if (status !== 200 || !indicator) return { ok: null, detail: "status page unreachable" };
    return { ok: indicator === "none", detail: body.status.description || indicator };
  } catch {
    return { ok: null, detail: "status page unreachable" };
  }
}

export async function gatherStatus({ appUrl, tunnelReadyUrl, monitorStatusUrl, fetchImpl = fetch }) {
  const [app, tunnel, external, cloudflare] = await Promise.all([
    probeApp(fetchImpl, appUrl),
    probeTunnel(fetchImpl, tunnelReadyUrl),
    probeExternal(fetchImpl, monitorStatusUrl),
    probeCloudflare(fetchImpl),
  ]);
  return { app, tunnel, external, cloudflare };
}

// Walk the request path from the origin outwards and blame the first broken
// layer. The external checks come last: they see every layer at once, so
// they only add information when the inner ones are healthy.
export function diagnose(report) {
  const { app, tunnel, external, cloudflare } = report;
  const { http_ready: ready, http_discovery: discovery, heartbeat_worker: worker, heartbeat_bot: bot } = external.checks;

  if (!app.ok) return { verdict: "DOWN", where: `host (app): ${app.detail}` };
  if (tunnel.ok === false) return { verdict: "DOWN", where: `Cloudflare tunnel: cloudflared ${tunnel.detail}` };
  if (ready?.status === "down") {
    const incident = cloudflare.ok === false ? `; Cloudflare reports ${cloudflare.detail}` : "";
    return {
      verdict: "DOWN",
      where: `Cloudflare edge: origin and tunnel are healthy but the public probe fails (${ready.detail})${incident}`,
    };
  }
  if (worker?.status === "down") return { verdict: "DEGRADED", where: `host (worker): heartbeat ${worker.detail}` };
  if (bot?.status === "down") {
    return { verdict: "DEGRADED", where: `host (bot): heartbeat ${bot.detail} although the bot answers; check HEARTBEAT_URL_BOT` };
  }
  if (discovery?.status === "down") return { verdict: "DEGRADED", where: `host (app config): discovery ${discovery.detail}` };
  if (external.ok !== true) return { verdict: "UP", where: `unverified from outside: external monitor ${external.detail}` };
  return { verdict: "UP", where: null };
}

function age(ms) {
  return ms === undefined ? "never" : `${Math.round(ms / 1000)}s ago`;
}

function mark(ok) {
  return ok === null ? "unknown" : ok ? "ok" : "DOWN";
}

function clock(ms) {
  return new Date(ms).toISOString().slice(11, 16) + " UTC";
}

function heartbeatLine(label, check, ageMs) {
  const state = check ? mark(check.status === "up") : "unknown";
  return `${label}: ${state} - heartbeat ${age(ageMs)}`;
}

function publicProbeLine(external) {
  if (external.ok !== true) return `Public probe: unknown - ${external.detail}`;
  const { http_ready: ready, http_discovery: discovery } = external.checks;
  if (!ready) return "Public probe: unknown - no checks recorded yet";
  const state = ready.status === "up" ? "ok" : `DOWN since ${clock(ready.since)}`;
  const parts = [`ready ${ready.detail}`];
  if (discovery) parts.push(`discovery ${discovery.status === "up" ? "ok" : discovery.detail}`);
  return `Public probe: ${state} - ${parts.join(", ")}`;
}

export function formatStatus(report, diagnosis, { now = Date.now(), viaTelegram = true } = {}) {
  const { app, tunnel, external, cloudflare } = report;
  const lines = [
    `Status: ${diagnosis.verdict}`,
    `Where: ${diagnosis.where ?? "nothing is down"}`,
    "",
    viaTelegram ? "You -> Telegram -> bot: ok (this reply)" : "You -> Telegram -> bot: not exercised (shell run)",
    `Cloudflare: ${cloudflare.ok === false ? "incident" : mark(cloudflare.ok)} - ${cloudflare.detail}`,
    `Tunnel (cloudflared): ${mark(tunnel.ok)} - ${tunnel.detail}`,
    `Host app: ${mark(app.ok)} - ${app.detail}`,
    heartbeatLine("Host worker", external.checks.heartbeat_worker, external.heartbeats.worker),
    heartbeatLine("Host bot", external.checks.heartbeat_bot, external.heartbeats.bot),
    publicProbeLine(external),
    "",
    `Checked ${clock(now)}.`,
  ];
  if (diagnosis.verdict === "UP") {
    lines[lines.length - 1] += " If the site still fails for you, the problem is on your side (DNS, network, browser).";
  }
  return lines.join("\n");
}

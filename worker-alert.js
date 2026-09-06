// Operator alerts for the worker: plain-CommonJS twin of
// lib/server/services/operatorAlerts.ts. Same `alert:<key>` NX window in
// Redis so the app and the worker dedupe against each other, and the same
// per-process window in front of it so a Redis outage cannot turn the 1s
// webhook loop's failures into a message per second. Best effort, never
// throws. Keep the two in sync.

const ALERT_WINDOW_SECONDS = 300;
const LOCAL_WINDOWS_MAX = 512;
const SEND_TIMEOUT_MS = 5000;

function createOperatorAlerter({ redis, chatId, token, enabled, log, fetchImpl = fetch, now = Date.now }) {
  const localWindows = new Map();

  function acquireLocalWindow(key, windowSeconds) {
    const at = now();
    if ((localWindows.get(key) || 0) > at) return false;
    if (localWindows.size >= LOCAL_WINDOWS_MAX) {
      for (const [k, until] of localWindows) if (until <= at) localWindows.delete(k);
    }
    localWindows.set(key, at + windowSeconds * 1000);
    return true;
  }

  async function acquireSharedWindow(key, windowSeconds) {
    try {
      return (await redis.set(`alert:${key}`, "1", "EX", windowSeconds, "NX")) === "OK";
    } catch {
      return true;
    }
  }

  async function countSent() {
    const day = new Date(now()).toISOString().slice(0, 10);
    try {
      await redis.incr(`alerts:sent:${day}`);
      await redis.expire(`alerts:sent:${day}`, 48 * 3600);
    } catch {
      // best effort
    }
  }

  async function send(key, text, opts = {}) {
    if (!enabled || !chatId || !token) return false;
    const windowSeconds = opts.windowSeconds ?? ALERT_WINDOW_SECONDS;
    if (!acquireLocalWindow(key, windowSeconds)) return false;
    if (!(await acquireSharedWindow(key, windowSeconds))) return false;
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`telegram sendMessage failed: ${res.status}`);
      await countSent();
      return true;
    } catch (err) {
      log.error("operator_alert_failed", { alert: key, error: err });
      return false;
    }
  }

  return { send };
}

const noopAlerter = { send: async () => false };

module.exports = { createOperatorAlerter, noopAlerter, ALERT_WINDOW_SECONDS };

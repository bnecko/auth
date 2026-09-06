import { alertTelegramChatId, isProduction } from "../config";
import redis, { getLastRedisError } from "../redis";
import { sendTelegramMessage } from "../telegramSend";
import { log } from "../log";

// Operator alerts: one Telegram message per key per window, best effort,
// never throws, no-op outside production or without an alert chat. Two
// windows stack: Redis (`alert:<key>` NX) dedupes across the app and the
// worker, and a per-process map in front of it bounds the rate when Redis
// itself is the thing failing, which is exactly when redis_degraded fires
// on every request.
export const ALERT_WINDOW_SECONDS = 300;
export const DEGRADED_WINDOW_SECONDS = 1800;
const LOCAL_WINDOWS_MAX = 512;

const localWindows = new Map<string, number>();

function acquireLocalWindow(key: string, windowSeconds: number) {
  const now = Date.now();
  if ((localWindows.get(key) || 0) > now) return false;
  if (localWindows.size >= LOCAL_WINDOWS_MAX) {
    for (const [k, until] of localWindows) if (until <= now) localWindows.delete(k);
  }
  localWindows.set(key, now + windowSeconds * 1000);
  return true;
}

async function acquireSharedWindow(key: string, windowSeconds: number) {
  try {
    return (await redis.set(`alert:${key}`, "1", "EX", windowSeconds, "NX")) === "OK";
  } catch {
    // Fail open: a possible duplicate beats a dropped alert, and the local
    // window above still caps the rate.
    return true;
  }
}

// Counter the daily digest reports, so "alerts sent today: 0" and a dead
// channel are distinguishable. Best effort.
async function countSent() {
  const day = new Date().toISOString().slice(0, 10);
  try {
    await redis.incr(`alerts:sent:${day}`);
    await redis.expire(`alerts:sent:${day}`, 48 * 3600);
  } catch {
    // nothing to do
  }
}

export async function sendOperatorAlert(
  key: string,
  text: string,
  opts: { windowSeconds?: number } = {},
): Promise<boolean> {
  const chatId = alertTelegramChatId();
  if (!chatId || !isProduction()) return false;
  const windowSeconds = opts.windowSeconds ?? ALERT_WINDOW_SECONDS;
  if (!acquireLocalWindow(key, windowSeconds)) return false;
  if (!(await acquireSharedWindow(key, windowSeconds))) return false;
  try {
    await sendTelegramMessage({ chatId, text });
    await countSent();
    return true;
  } catch (err) {
    log.error("operator_alert_failed", { alert: key, error: err });
    return false;
  }
}

// Fired by the rate limiter on every request while Redis is unreachable; the
// windows make that one message per half hour. The production gate comes
// first so nothing below runs in tests that stub the redis module.
export function alertRedisDegraded() {
  if (!isProduction()) return;
  const last = getLastRedisError();
  void sendOperatorAlert(
    "redis_degraded",
    `Redis unreachable\nRate limiting is on the in-process fallback.\n${last ? `${last.at} ${last.message}` : "no error recorded"}`,
    { windowSeconds: DEGRADED_WINDOW_SECONDS },
  );
}

export function _resetForTests() {
  localWindows.clear();
}

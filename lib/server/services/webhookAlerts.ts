import { alertTelegramChatId, isProduction } from "../config";
import redis from "../redis";
import { sendTelegramMessage, escapeHtml } from "../telegramSend";
import { log } from "../log";

// Operator alerts for webhook trouble. Best-effort and rate-limited: one
// message per key per window so a flapping endpoint cannot spam the operator
// chat. No-ops without an alert chat id or outside production. Never throws.
const ALERT_WINDOW_SECONDS = 300;

async function withinRateLimit(key: string): Promise<boolean> {
  try {
    const set = await redis.set(`alert:${key}`, "1", "EX", ALERT_WINDOW_SECONDS, "NX");
    return set === "OK";
  } catch {
    // Fail open: a possible duplicate alert beats a silently dropped one.
    return true;
  }
}

async function deliver(key: string, text: string) {
  const chatId = alertTelegramChatId();
  if (!chatId || !isProduction()) return;
  if (!(await withinRateLimit(key))) return;
  try {
    await sendTelegramMessage({ chatId, text });
  } catch (err) {
    log.error("operator_alert_failed", { key, error: err });
  }
}

export async function sendEnqueueFailedAlert(appId: number, reason: string) {
  await deliver(
    `webhook_enqueue_failed:${appId}`,
    `<b>Webhook enqueue failed</b>\napp #${appId}\n${escapeHtml(reason)}`,
  );
}

export async function sendWebhookDisabledAlert(endpointId: number, failures: number) {
  await deliver(
    `webhook_disabled:${endpointId}`,
    `<b>Webhook endpoint auto-disabled</b>\nendpoint #${endpointId} after ${failures} consecutive failures`,
  );
}

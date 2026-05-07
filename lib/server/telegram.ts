import { createHash, createHmac } from "crypto";
import { env } from "./config";
import { safeEqual } from "./crypto";
import type { TelegramIdentity } from "./types";

type TelegramPayload = Record<string, string | number | undefined>;

export function verifyTelegramLogin(payload: TelegramPayload) {
  const botToken = env("TELEGRAM_BOT_TOKEN");
  const hash = String(payload.hash || "");
  const authDate = Number(payload.auth_date || 0);

  if (!botToken || !hash || !authDate) {
    return null;
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds < 0 || ageSeconds > 86400) {
    return null;
  }

  const dataCheckString = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (!safeEqual(expected, hash)) {
    return null;
  }

  return {
    id: String(payload.id),
    firstName: String(payload.first_name || ""),
    username: payload.username ? String(payload.username) : null,
    authDate,
  } satisfies TelegramIdentity;
}

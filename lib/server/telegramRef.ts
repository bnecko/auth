import { createHmac } from "crypto";
import { env } from "./config";

// A stable, public, NON-reversible reference to a user's Telegram account.
// Integrating developers can use this to keep a local ban list that survives a
// user deleting and recreating their Bottleneck account (the Telegram ID is the
// same), without us exposing the raw numeric Telegram ID publicly.
//
// It must be an HMAC, not a plain hash: Telegram IDs are small (~10 digits), so
// a plain sha256 would be trivially brute-forced back to the real ID. The key
// is a server secret, so the ref cannot be reversed without it. The raw ID is
// only revealed to admins and to the authenticated developer API (telegram:read).
export function telegramPublicRef(telegramId: string | null | undefined): string | null {
  if (!telegramId) return null;
  const secret =
    env("TELEGRAM_REF_SECRET") || env("OAUTH_CSRF_SECRET") || "bn-telegram-ref-fallback";
  return createHmac("sha256", secret).update(telegramId).digest("hex").slice(0, 16);
}

import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

// A zero-padded numeric one-time code (default 6 digits) for the login 2FA
// flow. Uses a uniform CSPRNG draw so codes are not biased.
export function numericCode(digits = 6) {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

export function publicId(prefix: string) {
  return `${prefix}_${randomToken(18)}`;
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function telegramStartToken() {
  return randomToken(24);
}

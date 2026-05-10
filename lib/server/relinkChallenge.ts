import { randomBytes } from "crypto";
import redis from "./redis";
import { hashToken, randomToken } from "./crypto";
import { relinkTelegram } from "./repositories/users";

const TTL = 600; // 10 minutes

const OTP_KEY = (userId: number) => `relink:otp:${userId}`;
const TOKEN_KEY = (startHash: string) => `relink:tok:${startHash}`;
const STATUS_KEY = (browserHash: string) => `relink:sta:${browserHash}`;

// Unambiguous uppercase alphanumeric — no O/0/I/1
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRelinkOtp(): string {
  const bytes = randomBytes(20);
  return Array.from(bytes)
    .map(b => CHARS[b % CHARS.length])
    .join("")
    .slice(0, 10);
}

export async function createRelinkOtp(userId: number): Promise<string> {
  const code = generateRelinkOtp();
  await redis.setex(OTP_KEY(userId), TTL, code);
  return code;
}

export async function verifyRelinkOtp(userId: number, code: string): Promise<boolean> {
  const stored = await redis.get(OTP_KEY(userId));
  if (!stored || stored.toUpperCase() !== code.trim().toUpperCase()) {
    return false;
  }
  await redis.del(OTP_KEY(userId));
  return true;
}

export async function createRelinkChallenge(userId: number) {
  const startToken = randomToken(24);
  const browserToken = randomToken(24);
  const startHash = hashToken(startToken);
  const browserHash = hashToken(browserToken);

  // startHash maps to userId + browserHash so the bot webhook knows what to update
  await redis.setex(TOKEN_KEY(startHash), TTL, `${userId}:${browserHash}`);
  await redis.setex(STATUS_KEY(browserHash), TTL, "pending");

  return { startToken, browserToken };
}

export async function getRelinkStatus(browserToken: string) {
  const browserHash = hashToken(browserToken);
  return await redis.get(STATUS_KEY(browserHash));
}

export async function completeRelinkByTelegram(
  startToken: string,
  telegram: { id: string; firstName: string; username: string | null },
): Promise<{ userId: number; linked: boolean } | null> {
  const startHash = hashToken(startToken);
  const value = await redis.get(TOKEN_KEY(startHash));
  if (!value) return null;

  const colonIdx = value.indexOf(":");
  const userId = Number(value.slice(0, colonIdx));
  const browserHash = value.slice(colonIdx + 1);
  if (!userId || !browserHash) return null;

  const linked = await relinkTelegram(userId, telegram);

  await redis.setex(STATUS_KEY(browserHash), TTL, linked ? "verified" : "conflict");
  await redis.del(TOKEN_KEY(startHash));

  return { userId, linked: !!linked };
}

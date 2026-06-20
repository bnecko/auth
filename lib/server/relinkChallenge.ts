import { randomBytes } from "crypto";
import redis from "./redis";
import { hashToken, randomToken } from "./crypto";
import { relinkTelegram } from "./repositories/users";

const TTL = 600; // 10 minutes

const OTP_KEY = (userId: number) => `relink:otp:${userId}`;
const TOKEN_KEY = (startHash: string) => `relink:tok:${startHash}`;
const STATUS_KEY = (browserHash: string) => `relink:sta:${browserHash}`;
// Short opaque handle for an approval prompt — small enough to ride in a
// Telegram callback_data payload, unlike the 64-char start-token hash.
const APPR_KEY = (apprId: string) => `relink:appr:${apprId}`;

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

// Step 1 of the relink: the bot saw a valid /start token. Don't link yet —
// mint a short approval handle and return the owner so the caller can send an
// Approve/Deny prompt. Returns null if the token is unknown or expired.
export async function beginRelinkApproval(
  startToken: string,
): Promise<{ userId: number; apprId: string } | null> {
  const startHash = hashToken(startToken);
  const value = await redis.get(TOKEN_KEY(startHash));
  if (!value) return null;

  const colonIdx = value.indexOf(":");
  const userId = Number(value.slice(0, colonIdx));
  const browserHash = value.slice(colonIdx + 1);
  if (!userId || !browserHash) return null;

  const apprId = randomToken(12);
  await redis.setex(APPR_KEY(apprId), TTL, startHash);

  return { userId, apprId };
}

// Step 2: the owner tapped Approve or Deny. On approve we perform the actual
// link; on deny (or a link conflict) the waiting browser sees a terminal
// status. Returns null if the approval handle is unknown or expired.
export async function decideRelink(input: {
  apprId: string;
  decision: "approve" | "deny";
  telegram: { id: string; firstName: string; username: string | null };
}): Promise<{ userId: number; status: "verified" | "conflict" | "denied" } | null> {
  const startHash = await redis.get(APPR_KEY(input.apprId));
  if (!startHash) return null;

  const value = await redis.get(TOKEN_KEY(startHash));
  if (!value) {
    await redis.del(APPR_KEY(input.apprId));
    return null;
  }

  const colonIdx = value.indexOf(":");
  const userId = Number(value.slice(0, colonIdx));
  const browserHash = value.slice(colonIdx + 1);
  if (!userId || !browserHash) return null;

  let status: "verified" | "conflict" | "denied";
  if (input.decision === "deny") {
    status = "denied";
  } else {
    const linked = await relinkTelegram(userId, input.telegram);
    status = linked ? "verified" : "conflict";
  }

  await redis.setex(STATUS_KEY(browserHash), TTL, status);
  await redis.del(TOKEN_KEY(startHash));
  await redis.del(APPR_KEY(input.apprId));

  return { userId, status };
}

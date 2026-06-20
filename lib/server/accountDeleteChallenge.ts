import redis from "./redis";
import { hashToken, randomToken } from "./crypto";

// Redis-backed handle for a user-initiated account deletion that must be
// confirmed over Telegram, mirroring bearerRevokeChallenge. The short apprId
// rides in the Telegram callback_data; the browserToken lets the web page poll.
const TTL = 600;
const APPR_KEY = (apprId: string) => `acctdelete:appr:${apprId}`;
const STATUS_KEY = (browserHash: string) => `acctdelete:sta:${browserHash}`;

export type AccountDeleteStatus = "pending" | "scheduled" | "denied";

export async function beginAccountDeleteApproval(input: { userId: number }) {
  const apprId = randomToken(12);
  const browserToken = randomToken(24);
  const browserHash = hashToken(browserToken);
  await redis.setex(
    APPR_KEY(apprId),
    TTL,
    JSON.stringify({ userId: input.userId, browserHash }),
  );
  await redis.setex(STATUS_KEY(browserHash), TTL, "pending");
  return { apprId, browserToken };
}

export async function resolveAccountDeleteApproval(apprId: string) {
  const raw = await redis.get(APPR_KEY(apprId));
  if (!raw) return null;
  await redis.del(APPR_KEY(apprId));
  try {
    return JSON.parse(raw) as { userId: number; browserHash: string };
  } catch {
    return null;
  }
}

export async function setAccountDeleteStatus(
  browserHash: string,
  status: AccountDeleteStatus,
) {
  await redis.setex(STATUS_KEY(browserHash), TTL, status);
}

export async function getAccountDeleteStatus(browserToken: string) {
  return redis.get(STATUS_KEY(hashToken(browserToken)));
}

import redis from "./redis";
import { hashToken, randomToken } from "./crypto";

// Redis-backed handle for a user-initiated bearer revocation that must be
// confirmed over Telegram, mirroring relinkChallenge. The short apprId rides in
// the Telegram callback_data; the browserToken lets the web page poll status.
const TTL = 600;
const APPR_KEY = (apprId: string) => `bearerrevoke:appr:${apprId}`;
const STATUS_KEY = (browserHash: string) => `bearerrevoke:sta:${browserHash}`;

export type BearerRevokeStatus = "pending" | "revoked" | "denied";

export async function beginBearerRevokeApproval(input: {
  bearerPublicId: string;
  userId: number;
}) {
  const apprId = randomToken(12);
  const browserToken = randomToken(24);
  const browserHash = hashToken(browserToken);
  await redis.setex(
    APPR_KEY(apprId),
    TTL,
    JSON.stringify({ bearerPublicId: input.bearerPublicId, userId: input.userId, browserHash }),
  );
  await redis.setex(STATUS_KEY(browserHash), TTL, "pending");
  return { apprId, browserToken };
}

export async function resolveBearerRevokeApproval(apprId: string) {
  const raw = await redis.get(APPR_KEY(apprId));
  if (!raw) return null;
  await redis.del(APPR_KEY(apprId));
  try {
    return JSON.parse(raw) as {
      bearerPublicId: string;
      userId: number;
      browserHash: string;
    };
  } catch {
    return null;
  }
}

export async function setBearerRevokeStatus(
  browserHash: string,
  status: BearerRevokeStatus,
) {
  await redis.setex(STATUS_KEY(browserHash), TTL, status);
}

export async function getBearerRevokeStatus(browserToken: string) {
  return redis.get(STATUS_KEY(hashToken(browserToken)));
}

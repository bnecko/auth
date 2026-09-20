import redis from "../redis";
import { randomToken } from "../crypto";

const TTL_SECONDS = 600;
const NONCE_KEY = (userId: number) => `tonproof:nonce:${userId}`;

// One live challenge per user: asking for a second invalidates the first, so a
// nonce cannot be banked and replayed later.
//
// Stored as issued rather than hashed, unlike the email codes. The nonce is
// handed to the browser and on to the wallet, so it is not a secret, and the
// verifier needs the real value to compare against what was signed. Its job is
// to make each proof usable once, which the delete on read below does.
export async function createTonProofNonce(userId: number): Promise<string> {
  const nonce = randomToken(32);
  await redis.setex(NONCE_KEY(userId), TTL_SECONDS, nonce);
  return nonce;
}

// Returns the nonce issued to this user and deletes it in the same operation,
// so a proof that fails verification still burns the challenge instead of
// leaving a live one to grind against.
export async function consumeTonProofNonce(userId: number): Promise<string | null> {
  return redis.getdel(NONCE_KEY(userId));
}

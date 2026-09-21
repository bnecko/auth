import { adminStepUpTtlSeconds } from "./config";
import redis from "./redis";
import { randomBytes } from "crypto";

// The grant belongs to one session, not to the admin. Keyed by user alone, a
// step-up completed in the admin's own browser unlocked every other session of
// theirs for ten minutes, including one riding a stolen cookie: whoever held it
// only had to wait for the real admin to verify, and then had the whole panel,
// withdrawal approvals included. The step-up exists for exactly the case where
// a cookie is not enough, so it has to be earned by the session that uses it.
type SteppedUpSession = { user: { id: number }; session: { id: number } };

const key = (current: SteppedUpSession) => `admin:tg_step_up:${current.user.id}:${current.session.id}`;
const otpKey = (userId: number) => `admin:step_up_otp:${userId}`;
const OTP_TTL = 300; // 5 minutes
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function isAdminStepUpVerified(current: SteppedUpSession) {
  return (await redis.get(key(current))) === "1";
}

export async function grantAdminStepUp(current: SteppedUpSession) {
  await redis.setex(key(current), adminStepUpTtlSeconds, "1");
}

export async function createStepUpOtp(userId: number): Promise<string> {
  const bytes = randomBytes(10);
  const code = Array.from(bytes).map(b => CHARS[b % CHARS.length]).join("").slice(0, 8);
  await redis.setex(otpKey(userId), OTP_TTL, code);
  return code;
}

export async function verifyStepUpOtp(userId: number, code: string): Promise<boolean> {
  const stored = await redis.get(otpKey(userId));
  if (!stored || stored !== code.toUpperCase().trim()) return false;
  await redis.del(otpKey(userId));
  return true;
}

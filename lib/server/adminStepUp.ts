import { adminStepUpTtlSeconds } from "./config";
import redis from "./redis";
import { randomBytes } from "crypto";

const key = (userId: number) => `admin:tg_step_up:${userId}`;
const otpKey = (userId: number) => `admin:step_up_otp:${userId}`;
const OTP_TTL = 300; // 5 minutes
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function isAdminStepUpVerified(userId: number) {
  return (await redis.get(key(userId))) === "1";
}

export async function grantAdminStepUp(userId: number) {
  await redis.setex(key(userId), adminStepUpTtlSeconds, "1");
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

import { adminStepUpTtlSeconds } from "./config";
import redis from "./redis";

const key = (userId: number) => `admin:tg_step_up:${userId}`;

export async function isAdminStepUpVerified(userId: number) {
  return (await redis.get(key(userId))) === "1";
}

export async function grantAdminStepUp(userId: number) {
  await redis.setex(key(userId), adminStepUpTtlSeconds, "1");
}

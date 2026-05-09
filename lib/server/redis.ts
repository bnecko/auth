import Redis from "ioredis";
import { env } from "./config";

const redisUrl = env("REDIS_URL") || "redis://localhost:6379";

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

export default redis;

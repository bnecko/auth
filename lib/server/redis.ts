import Redis from "ioredis";
import { env } from "./config";
import { log } from "./log";

const redisUrl = env("REDIS_URL") || "redis://localhost:6379";

const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

// Track the most recent connection error so fail-open paths (rate limiting)
// and the readiness probe can surface that Redis is degraded instead of the
// error vanishing into a console line.
let lastError: { at: string; message: string } | null = null;

redis.on("error", (err) => {
  lastError = { at: new Date().toISOString(), message: err instanceof Error ? err.message : String(err) };
  log.error("redis_error", { error: err });
});

export function getLastRedisError() {
  return lastError;
}

// Readiness probe. ioredis has no per-call timeout, so race PING against a
// short timer. Returns false rather than throwing.
export async function redisHealthy(timeoutMs = 2000): Promise<boolean> {
  try {
    const ping = redis.ping().then(() => true);
    const timeout = new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs));
    return await Promise.race([ping.catch(() => false), timeout]);
  } catch {
    return false;
  }
}

export default redis;

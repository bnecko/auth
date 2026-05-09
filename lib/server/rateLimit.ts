import redis from "./redis";

/**
 * Basic fixed-window rate limiter using Redis.
 * @param key The unique key to rate limit (e.g. "rl:login:ip:127.0.0.1")
 * @param limit Maximum number of allowed requests in the window
 * @param windowMs The time window in milliseconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; reset: number; remaining: number }> {
  const multi = redis.multi();
  multi.incr(key);
  multi.pttl(key);
  
  const results = await multi.exec();
  
  if (!results) {
    // If multi fails, fail open to prevent locking out users on Redis transient errors
    return { success: true, reset: Date.now() + windowMs, remaining: limit };
  }
  
  const count = results[0][1] as number;
  let ttl = results[1][1] as number;
  
  if (ttl === -1 || ttl === -2) {
    // Key has no expiration or didn't exist when INCR ran
    await redis.pexpire(key, windowMs);
    ttl = windowMs;
  }
  
  return {
    success: count <= limit,
    reset: Date.now() + ttl,
    remaining: Math.max(0, limit - count)
  };
}

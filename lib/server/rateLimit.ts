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

  let results: Awaited<ReturnType<typeof multi.exec>> = null;
  try {
    results = await multi.exec();
  } catch {
    // Fail open on a Redis connection error rather than locking everyone out.
    return { success: true, reset: Date.now() + windowMs, remaining: limit };
  }

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

// Failure counters for brute-force protection: explicit incr-on-failure,
// clear-on-success counters keyed per IP / identifier / user. Distinct
// from the fixed-window rateLimit() above, which gates request volume
// regardless of outcome. These let a successful login clear the slate so
// a legitimate user is never locked out by their own earlier typos.
export async function readFailureCount(key: string): Promise<number> {
  return Number(await redis.get(key)) || 0;
}

// Returns the post-increment count so callers can act exactly on the
// threshold-crossing attempt (INCR is atomic, so only one concurrent caller
// observes the boundary value) rather than re-reading and racing.
export async function bumpFailureCount(key: string, windowSeconds: number): Promise<number> {
  const results = await redis.multi().incr(key).expire(key, windowSeconds).exec();
  return Number(results?.[0]?.[1] ?? 0);
}

export async function clearFailureCount(key: string): Promise<void> {
  await redis.del(key);
}

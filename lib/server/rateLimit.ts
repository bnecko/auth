import redis from "./redis";

// Per-instance, volatile fallback windows used only when Redis is unreachable.
// They reset on restart and are not shared across instances, so they are
// best-effort defense-in-depth rather than a global guarantee. The point is
// that a Redis outage must not turn the limiter into a fully open door:
// without this, an attacker who can detect a Redis blip gets unlimited login
// and registration attempts.
const fallbackWindows = new Map<string, { count: number; resetAt: number }>();
const FALLBACK_MAX_KEYS = 50_000;

function fallbackRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; reset: number; remaining: number } {
  const now = Date.now();

  // Prune expired windows once the map grows large so a long outage with many
  // distinct keys (one per IP) can't grow memory without bound.
  if (fallbackWindows.size > FALLBACK_MAX_KEYS) {
    for (const [k, window] of fallbackWindows) {
      if (window.resetAt <= now) fallbackWindows.delete(k);
    }
  }

  const existing = fallbackWindows.get(key);
  if (!existing || existing.resetAt <= now) {
    const window = { count: 1, resetAt: now + windowMs };
    fallbackWindows.set(key, window);
    return { success: true, reset: window.resetAt, remaining: limit - 1 };
  }

  existing.count += 1;
  return {
    success: existing.count <= limit,
    reset: existing.resetAt,
    remaining: Math.max(0, limit - existing.count),
  };
}

/**
 * Basic fixed-window rate limiter using Redis, with an in-process fallback
 * when Redis is unreachable.
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
    // Redis unreachable: fall back to the in-process limiter rather than
    // failing fully open.
    return fallbackRateLimit(key, limit, windowMs);
  }

  if (!results) {
    return fallbackRateLimit(key, limit, windowMs);
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

import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory Redis fake covering the subset the failure-counter helpers use:
// get, del, and a multi().incr().expire().exec() chain.
const store = new Map<string, number>();
const fakeRedis = {
  async get(key: string) {
    return store.has(key) ? String(store.get(key)) : null;
  },
  async del(key: string) {
    store.delete(key);
    return 1;
  },
  multi() {
    const results: Array<[null, number]> = [];
    const chain = {
      incr(key: string) {
        const next = (store.get(key) || 0) + 1;
        store.set(key, next);
        results.push([null, next]);
        return chain;
      },
      expire(_key: string, _seconds: number) {
        results.push([null, 1]);
        return chain;
      },
      async exec() {
        return results;
      },
    };
    return chain;
  },
  _reset() {
    store.clear();
  },
};

vi.mock('@/lib/server/redis', () => ({ default: fakeRedis }));

// Import after the mock so the module binds our fake (static imports hoist
// above the fake's initialization and trip a temporal-dead-zone error).
const { readFailureCount, bumpFailureCount, clearFailureCount } = await import(
  '@/lib/server/rateLimit'
);

describe('brute-force failure counters', () => {
  beforeEach(() => fakeRedis._reset());

  it('reads zero for an unknown key', async () => {
    expect(await readFailureCount('rate_limit:login_failure:user:1')).toBe(0);
  });

  it('bump increments, returns the post-increment count, and read reflects it', async () => {
    const key = 'rate_limit:login_failure:user:1';
    expect(await bumpFailureCount(key, 3600)).toBe(1);
    expect(await bumpFailureCount(key, 3600)).toBe(2);
    expect(await bumpFailureCount(key, 3600)).toBe(3);
    expect(await readFailureCount(key)).toBe(3);
  });

  it('clear resets the count to zero (success clears the slate)', async () => {
    const key = 'rate_limit:login_failure:user:1';
    await bumpFailureCount(key, 3600);
    await clearFailureCount(key);
    expect(await readFailureCount(key)).toBe(0);
  });

  it('counters are independent per key', async () => {
    await bumpFailureCount('rate_limit:login_failure:user:1', 3600);
    await bumpFailureCount('rate_limit:login_failure:user:2', 3600);
    await bumpFailureCount('rate_limit:login_failure:user:2', 3600);
    expect(await readFailureCount('rate_limit:login_failure:user:1')).toBe(1);
    expect(await readFailureCount('rate_limit:login_failure:user:2')).toBe(2);
  });
});

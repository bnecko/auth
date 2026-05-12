import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory Redis fake. Implements only the subset rateLimit() uses:
// multi() with incr + pttl, plus a top-level pexpire. Tests can reset
// state via fakeRedis._reset() between cases. `failNextMulti` is a
// mutable flag on the same object the closure references — avoids the
// spread-by-value pitfall where flipping the flag wouldn't be observed
// by the closure.
const fakeRedis = {
  counts: new Map<string, number>(),
  expires: new Map<string, number>(),
  failNextMulti: false,
  pttlOf(key: string): number {
    const exp = this.expires.get(key);
    if (exp === undefined) return -1;
    const remaining = exp - Date.now();
    return remaining > 0 ? remaining : -2;
  },
  multi() {
    const self = this;
    const ops: Array<{ kind: 'incr' | 'pttl'; key: string }> = [];
    const chain = {
      incr(key: string) {
        ops.push({ kind: 'incr', key });
        return chain;
      },
      pttl(key: string) {
        ops.push({ kind: 'pttl', key });
        return chain;
      },
      async exec(): Promise<[unknown, number][] | null> {
        if (self.failNextMulti) {
          self.failNextMulti = false;
          return null;
        }
        return ops.map(op => {
          if (op.kind === 'incr') {
            const next = (self.counts.get(op.key) || 0) + 1;
            self.counts.set(op.key, next);
            return [null, next];
          }
          return [null, self.pttlOf(op.key)];
        });
      },
    };
    return chain;
  },
  async pexpire(key: string, ms: number) {
    this.expires.set(key, Date.now() + ms);
  },
  _reset() {
    this.counts.clear();
    this.expires.clear();
    this.failNextMulti = false;
  },
};

vi.mock('@/lib/server/redis', () => ({ default: fakeRedis }));

// Import after mock so the module gets our fake.
const { rateLimit } = await import('@/lib/server/rateLimit');

describe('rateLimit', () => {
  beforeEach(() => {
    fakeRedis._reset();
  });

  it('allows the first request and returns remaining capacity', async () => {
    const result = await rateLimit('rl:test:first', 5, 1000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.reset).toBeGreaterThan(Date.now());
  });

  it('sets pexpire on a fresh key (pttl was -1)', async () => {
    await rateLimit('rl:test:expire', 5, 60_000);
    // After the call, the key should have an expiration set.
    expect(fakeRedis.expires.has('rl:test:expire')).toBe(true);
    const remaining = (fakeRedis.expires.get('rl:test:expire') || 0) - Date.now();
    expect(remaining).toBeGreaterThan(50_000);
  });

  it('keeps success=true exactly at the limit boundary', async () => {
    const key = 'rl:test:boundary';
    let last;
    for (let i = 0; i < 3; i++) {
      last = await rateLimit(key, 3, 1000);
    }
    expect(last?.success).toBe(true);
    expect(last?.remaining).toBe(0);
  });

  it('flips success=false once count exceeds the limit', async () => {
    const key = 'rl:test:exceed';
    for (let i = 0; i < 3; i++) {
      await rateLimit(key, 3, 1000);
    }
    const overflow = await rateLimit(key, 3, 1000);
    expect(overflow.success).toBe(false);
    expect(overflow.remaining).toBe(0);
  });

  it('fails open when multi.exec() returns null (transient redis error)', async () => {
    fakeRedis.failNextMulti = true;
    const result = await rateLimit('rl:test:transient', 5, 1000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it('isolates buckets by key', async () => {
    for (let i = 0; i < 3; i++) {
      await rateLimit('rl:test:a', 3, 1000);
    }
    const aOver = await rateLimit('rl:test:a', 3, 1000);
    const b = await rateLimit('rl:test:b', 3, 1000);
    expect(aOver.success).toBe(false);
    expect(b.success).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory redis. getdel has to behave like the real one (read and remove in
// one step), because single use is the property under test.
const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  ttls: new Map<string, number>(),
}));
vi.mock('@/lib/server/redis', () => ({
  default: {
    setex: vi.fn(async (key: string, ttl: number, value: string) => {
      h.store.set(key, value);
      h.ttls.set(key, ttl);
    }),
    getdel: vi.fn(async (key: string) => {
      const value = h.store.get(key) ?? null;
      h.store.delete(key);
      return value;
    }),
  },
}));

import { consumeTonProofNonce, createTonProofNonce } from '@/lib/server/ton/proofChallenge';

beforeEach(() => {
  h.store.clear();
  h.ttls.clear();
  vi.clearAllMocks();
});

describe('TON proof challenge', () => {
  it('issues an unpredictable nonce per call', async () => {
    const first = await createTonProofNonce(1);
    const second = await createTonProofNonce(2);
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(20);
  });

  it('expires after ten minutes', async () => {
    await createTonProofNonce(1);
    expect(h.ttls.get('tonproof:nonce:1')).toBe(600);
  });

  it('returns the nonce that was issued', async () => {
    const nonce = await createTonProofNonce(7);
    expect(await consumeTonProofNonce(7)).toBe(nonce);
  });

  // A proof that fails verification must not leave a live challenge behind for
  // the next attempt, so the read is what burns it, not a later success.
  it('can only be consumed once', async () => {
    await createTonProofNonce(7);
    expect(await consumeTonProofNonce(7)).not.toBeNull();
    expect(await consumeTonProofNonce(7)).toBeNull();
  });

  it('is scoped to the user it was issued to', async () => {
    await createTonProofNonce(7);
    expect(await consumeTonProofNonce(8)).toBeNull();
    expect(await consumeTonProofNonce(7)).not.toBeNull();
  });

  it('keeps only the newest nonce for a user', async () => {
    const stale = await createTonProofNonce(7);
    const fresh = await createTonProofNonce(7);
    const consumed = await consumeTonProofNonce(7);
    expect(consumed).toBe(fresh);
    expect(consumed).not.toBe(stale);
  });

  it('reports nothing to consume when none was issued', async () => {
    expect(await consumeTonProofNonce(99)).toBeNull();
  });
});

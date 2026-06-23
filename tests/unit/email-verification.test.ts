import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashToken, normalizeIdentifier } from '@/lib/server/crypto';

// In-memory redis for the code key; rateLimit + email mocked so we control
// throttle/fail-count and never send.
const h = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock('@/lib/server/redis', () => ({
  default: {
    get: vi.fn(async (k: string) => h.store.get(k) ?? null),
    setex: vi.fn(async (k: string, _ttl: number, v: string) => {
      h.store.set(k, v);
    }),
    del: vi.fn(async (k: string) => {
      h.store.delete(k);
    }),
  },
}));

const rl = vi.hoisted(() => ({
  rateLimit: vi.fn(async () => ({ success: true, reset: 0, remaining: 1 })),
  readFailureCount: vi.fn(async () => 0),
  bumpFailureCount: vi.fn(async () => 1),
  clearFailureCount: vi.fn(async () => {}),
}));
vi.mock('@/lib/server/rateLimit', () => rl);

const email = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/server/email', () => email);

import { requestEmailCode, verifyEmailCode } from '@/lib/server/emailVerification';

const ADDR = 'User@Example.com';
const codeKey = (purpose: string) =>
  `emailverify:code:${purpose}:${hashToken(normalizeIdentifier(ADDR))}`;

beforeEach(() => {
  h.store.clear();
  vi.clearAllMocks();
  rl.rateLimit.mockResolvedValue({ success: true, reset: 0, remaining: 1 });
  rl.readFailureCount.mockResolvedValue(0);
  rl.bumpFailureCount.mockResolvedValue(1);
});

describe('requestEmailCode', () => {
  it('stores a hashed code and sends the email', async () => {
    const res = await requestEmailCode(ADDR, 'settings');
    expect(res.sent).toBe(true);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const stored = h.store.get(codeKey('settings'));
    expect(stored).toBeTruthy();
    expect(stored).toHaveLength(64); // sha256 hex, not the plaintext code
  });

  it('returns throttled and does not send when the per-minute limit trips', async () => {
    rl.rateLimit.mockResolvedValueOnce({ success: false, reset: 0, remaining: 0 });
    const res = await requestEmailCode(ADDR, 'settings');
    expect(res).toEqual({ sent: false, throttled: true });
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});

describe('verifyEmailCode', () => {
  it('accepts the correct code, then consumes it (single use)', async () => {
    h.store.set(codeKey('settings'), hashToken('123456'));
    expect(await verifyEmailCode(ADDR, 'settings', '123456')).toBe(true);
    expect(rl.clearFailureCount).toHaveBeenCalled();
    expect(h.store.has(codeKey('settings'))).toBe(false);
  });

  it('rejects a wrong code and bumps the failure counter', async () => {
    h.store.set(codeKey('settings'), hashToken('123456'));
    expect(await verifyEmailCode(ADDR, 'settings', '000000')).toBe(false);
    expect(rl.bumpFailureCount).toHaveBeenCalled();
  });

  it('fails closed when the code has expired (missing key)', async () => {
    expect(await verifyEmailCode(ADDR, 'settings', '123456')).toBe(false);
  });

  it('blocks and burns the code once the attempt cap is reached', async () => {
    rl.readFailureCount.mockResolvedValue(5);
    h.store.set(codeKey('settings'), hashToken('123456'));
    expect(await verifyEmailCode(ADDR, 'settings', '123456')).toBe(false);
    expect(h.store.has(codeKey('settings'))).toBe(false);
  });

  it('isolates codes by purpose (a register code does not verify under change)', async () => {
    h.store.set(codeKey('register'), hashToken('123456'));
    expect(await verifyEmailCode(ADDR, 'change', '123456')).toBe(false);
    expect(await verifyEmailCode(ADDR, 'register', '123456')).toBe(true);
  });
});

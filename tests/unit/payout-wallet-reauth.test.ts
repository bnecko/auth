import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The linked wallet is where withdrawals are paid. Changing it has to be asked
// of the account holder, not of whoever holds the session cookie.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));

const session = { user: { id: 7, restricted: false } };
vi.mock('@/lib/server/apiAuth', () => ({ requireUser: vi.fn(async () => ({ response: null, session })) }));
vi.mock('@/lib/server/session', () => ({
  getCurrentSession: vi.fn(async () => session),
  assertNotRestricted: vi.fn(),
}));
vi.mock('@/lib/server/rateLimit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/notifications', () => ({ notifyUser: vi.fn() }));
vi.mock('@/lib/server/ton/dns', () => ({ listOwnedDomains: vi.fn(), normalizeDomainLabel: vi.fn(), ownsDomain: vi.fn() }));

const isCurrentPassword = vi.fn();
vi.mock('@/lib/server/reauth', () => ({ isCurrentPassword: (...a: unknown[]) => isCurrentPassword(...a) }));

const recordSecurityEvent = vi.fn();
vi.mock('@/lib/server/repositories/securityEvents', () => ({
  recordSecurityEvent: (...a: unknown[]) => recordSecurityEvent(...a),
}));

const createTonProofNonce = vi.fn(async () => 'nonce-value');
vi.mock('@/lib/server/ton/proofChallenge', () => ({
  createTonProofNonce: (...a: unknown[]) => createTonProofNonce(...(a as [])),
}));

const unlinkTonWallet = vi.fn(async () => true);
vi.mock('@/lib/server/repositories/tonWallets', () => ({
  unlinkTonWallet: (...a: unknown[]) => unlinkTonWallet(...(a as [])),
  findTonWallet: vi.fn(),
  setTonWalletDisplay: vi.fn(),
  setTonWalletDomain: vi.fn(),
}));

import { POST as requestNonce } from '@/app/api/ton/proof/payload/route';
import { unlinkTonWalletAction } from '@/app/(app)/settings/ton/actions';

const nonceRequest = (body: unknown) =>
  requestNonce(
    new NextRequest('http://localhost/api/ton/proof/payload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const unlinkWith = (password?: string) => {
  const form = new FormData();
  if (password !== undefined) form.set('currentPassword', password);
  return unlinkTonWalletAction(null, form);
};

beforeEach(() => {
  vi.stubEnv('CRYPTO_ENABLED', 'true');
  for (const mock of [isCurrentPassword, recordSecurityEvent, createTonProofNonce, unlinkTonWallet]) mock.mockClear();
});

describe('linking a payout wallet', () => {
  // No nonce means no proof this server will accept, so this is the gate.
  it('issues no proof challenge without the account password', async () => {
    isCurrentPassword.mockResolvedValue(false);

    const res = await nonceRequest({});

    expect(res.status).toBe(403);
    expect(createTonProofNonce).not.toHaveBeenCalled();
  });

  it('records a wrong password, so guessing is visible', async () => {
    isCurrentPassword.mockResolvedValue(false);

    await nonceRequest({ currentPassword: 'guess' });

    expect(isCurrentPassword).toHaveBeenCalledWith(7, 'guess');
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, eventType: 'ton_wallet_link', result: 'invalid_password' }),
    );
  });

  it('issues one once the password checks out', async () => {
    isCurrentPassword.mockResolvedValue(true);

    const res = await nonceRequest({ currentPassword: 'correct horse' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ payload: 'nonce-value' });
  });
});

describe('unlinking a payout wallet', () => {
  // Unlinking is half of replacing the wallet, so it is gated the same way.
  it('leaves the wallet in place without the account password', async () => {
    isCurrentPassword.mockResolvedValue(false);

    expect(await unlinkWith()).toEqual({ error: 'current password is incorrect' });
    expect(await unlinkWith('guess')).toEqual({ error: 'current password is incorrect' });
    expect(unlinkTonWallet).not.toHaveBeenCalled();
  });

  it('unlinks once the password checks out', async () => {
    isCurrentPassword.mockResolvedValue(true);

    expect(await unlinkWith('correct horse')).toBeNull();
    expect(unlinkTonWallet).toHaveBeenCalledWith(7);
  });
});

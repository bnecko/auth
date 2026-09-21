import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A passkey signs in without the password and without the Telegram step, so
// adding one is asked of the account holder, not of whoever holds the cookie.

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));

const session = { user: { id: 9, username: 'owner', role: 'user', restricted: false } };
vi.mock('@/lib/server/apiAuth', () => ({ requireUser: vi.fn(async () => ({ response: null, session })) }));
vi.mock('@/lib/server/rateLimit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/webauthn', () => ({ getRpID: () => 'localhost', getOrigin: () => 'http://localhost', rpName: 'test' }));

const redisStore = new Map<string, string>();
vi.mock('@/lib/server/redis', () => ({
  default: {
    setex: vi.fn(async (key: string, _ttl: number, value: string) => void redisStore.set(key, value)),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    getdel: vi.fn(async (key: string) => {
      const value = redisStore.get(key) ?? null;
      redisStore.delete(key);
      return value;
    }),
    del: vi.fn(async (key: string) => void redisStore.delete(key)),
  },
}));

const isCurrentPassword = vi.fn();
vi.mock('@/lib/server/reauth', () => ({ isCurrentPassword: (...a: unknown[]) => isCurrentPassword(...a) }));

const recordSecurityEvent = vi.fn();
vi.mock('@/lib/server/repositories/securityEvents', () => ({
  recordSecurityEvent: (...a: unknown[]) => recordSecurityEvent(...a),
}));

const notifyUser = vi.fn();
vi.mock('@/lib/server/notifications', () => ({ notifyUser: (...a: unknown[]) => notifyUser(...a) }));

const findWebauthnCredentialsByUser = vi.fn();
const createWebauthnCredential = vi.fn();
const deleteWebauthnCredentialsForUser = vi.fn();
vi.mock('@/lib/server/repositories/webauthn', () => ({
  MAX_PASSKEYS_PER_USER: 10,
  MAX_PASSKEY_NAME_LENGTH: 64,
  findWebauthnCredentialsByUser: (...a: unknown[]) => findWebauthnCredentialsByUser(...a),
  createWebauthnCredential: (...a: unknown[]) => createWebauthnCredential(...a),
  deleteWebauthnCredentialsForUser: (...a: unknown[]) => deleteWebauthnCredentialsForUser(...a),
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(async () => ({ challenge: 'server-challenge' })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: { credential: { id: 'cred-1', publicKey: new Uint8Array([1]) }, credentialDeviceType: 'singleDevice' },
  })),
}));

const updateUserPassword = vi.fn();
vi.mock('@/lib/server/repositories/users', () => ({ updateUserPassword: (...a: unknown[]) => updateUserPassword(...a) }));
const revokeSessionsForUser = vi.fn();
vi.mock('@/lib/server/repositories/sessions', () => ({ revokeSessionsForUser: (...a: unknown[]) => revokeSessionsForUser(...a) }));
vi.mock('@/lib/server/password', () => ({ hashPassword: vi.fn(async () => 'hashed') }));

import { POST as requestOptions } from '@/app/api/auth/webauthn/register/generate-options/route';
import { POST as verifyEnrollment } from '@/app/api/auth/webauthn/register/verify/route';
import { resetPasswordAction } from '@/app/forgot/reset/actions';
import { hashToken } from '@/lib/server/crypto';

const post = (handler: (req: NextRequest) => Promise<Response>, path: string, body: unknown) =>
  handler(
    new NextRequest(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const CHALLENGE_KEY = 'webauthn:challenge:9';

beforeEach(() => {
  redisStore.clear();
  for (const mock of [
    isCurrentPassword,
    recordSecurityEvent,
    notifyUser,
    findWebauthnCredentialsByUser,
    createWebauthnCredential,
    deleteWebauthnCredentialsForUser,
  ]) {
    mock.mockReset();
  }
  findWebauthnCredentialsByUser.mockResolvedValue([]);
  createWebauthnCredential.mockResolvedValue({ id: 1 });
});

describe('asking to add a passkey', () => {
  // No challenge means nothing an authenticator can sign that the server will
  // accept, so this is the gate.
  it('issues no challenge without the account password', async () => {
    isCurrentPassword.mockResolvedValue(false);

    const res = await post(requestOptions, '/api/auth/webauthn/register/generate-options', { currentPassword: 'guess' });

    expect(res.status).toBe(403);
    expect(redisStore.has(CHALLENGE_KEY)).toBe(false);
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, eventType: 'webauthn_registered', result: 'invalid_password' }),
    );
  });

  it('issues one once the password checks out', async () => {
    isCurrentPassword.mockResolvedValue(true);

    const res = await post(requestOptions, '/api/auth/webauthn/register/generate-options', { currentPassword: 'right' });

    expect(res.status).toBe(200);
    expect(redisStore.get(CHALLENGE_KEY)).toBe('server-challenge');
  });

  it('refuses once the account already holds the most it may', async () => {
    isCurrentPassword.mockResolvedValue(true);
    findWebauthnCredentialsByUser.mockResolvedValue(new Array(10).fill({ credentialId: 'x', transports: [] }));

    const res = await post(requestOptions, '/api/auth/webauthn/register/generate-options', { currentPassword: 'right' });

    expect(res.status).toBe(400);
    expect(redisStore.has(CHALLENGE_KEY)).toBe(false);
  });
});

describe('a passkey being added', () => {
  it('tells the owner, and keeps only a short name', async () => {
    redisStore.set(CHALLENGE_KEY, 'server-challenge');

    const res = await post(verifyEnrollment, '/api/auth/webauthn/register/verify', { name: 'n'.repeat(5000), response: {} });

    expect(res.status).toBe(200);
    expect(createWebauthnCredential).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, name: 'n'.repeat(64) }));
    expect(notifyUser).toHaveBeenCalledWith(9, { type: 'passkey_added' });
  });
});

describe('a password reset', () => {
  // A reset is how an owner takes the account back. A passkey added by whoever
  // they are evicting signs in without the password, so it has to go too.
  it('removes every passkey along with the sessions', async () => {
    redisStore.set(`password_reset:${hashToken('reset-token')}`, '9');
    const form = new FormData();
    form.set('token', 'reset-token');
    form.set('password', 'a-new-long-password');

    expect(await resetPasswordAction(form)).toEqual({ success: true });

    expect(revokeSessionsForUser).toHaveBeenCalledWith(9);
    expect(deleteWebauthnCredentialsForUser).toHaveBeenCalledWith(9);
  });
});

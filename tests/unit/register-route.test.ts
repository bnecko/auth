import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const registerUser = vi.fn(async (..._args: unknown[]) => ({
  verificationId: 'reg_1',
  startToken: 'start-token',
  expiresAt: '2030-01-01T00:00:00.000Z',
}));
vi.mock('@/lib/server/services/auth', () => ({ registerUser: (...a: unknown[]) => registerUser(...a) }));

import { POST } from '@/app/api/auth/register/route';

const signup = {
  firstName: 'Ada',
  username: 'ada_lovelace',
  email: 'ada@example.com',
  password: 'a-long-enough-password',
  acceptTerms: true,
  turnstileToken: 'token',
};

const register = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

describe('POST /api/auth/register', () => {
  // The Telegram approval and the email code are where a banned Telegram id
  // and an unowned address are refused. A signed Telegram payload in the body
  // once skipped both by creating the account and a session straight away.
  it('opens an approval request and never an account, whatever the body carries', async () => {
    const res = await register({ ...signup, telegram: { id: 42, hash: 'signed', auth_date: 1 } });

    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ verificationId: 'reg_1', botUrl: expect.stringContaining('start-token') });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(registerUser.mock.calls[0]).toHaveLength(2);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Avoid a real ioredis connection at import time and keep every dependency the
// route touches stubbed, so this exercises only the ban gate in the login
// branch (a banned principal whose Telegram is still linked can self-issue a
// valid signed payload, so the route - not just session creation - must block).
vi.mock('@/lib/server/redis', () => ({ default: {} }));

// Signature validity is assumed; it is not what this test covers.
vi.mock('@/lib/server/telegram', () => ({
  verifyTelegramLogin: vi.fn(() => ({ id: '777', username: 'u', firstName: 'U' })),
}));

const findUserByTelegramId = vi.fn();
vi.mock('@/lib/server/repositories/users', () => ({
  findUserByTelegramId: (...a: unknown[]) => findUserByTelegramId(...a),
  linkTelegram: vi.fn(),
}));

const isTelegramIdBanned = vi.fn();
vi.mock('@/lib/server/repositories/bans', () => ({
  isTelegramIdBanned: (...a: unknown[]) => isTelegramIdBanned(...a),
}));

const createUserSession = vi.fn();
vi.mock('@/lib/server/session', () => ({
  createUserSession: (...a: unknown[]) => createUserSession(...a),
  // No existing session -> the route takes the login branch.
  getSessionFromRequest: vi.fn(async () => null),
}));

vi.mock('@/lib/server/config', () => ({ authBaseUrl: () => 'https://auth.example' }));
vi.mock('@/lib/server/http', () => ({
  requestContext: () => ({ ip: '', userAgent: '', country: '' }),
}));
vi.mock('@/lib/server/repositories/securityEvents', () => ({ recordSecurityEvent: vi.fn() }));

import { GET } from '@/app/api/telegram/callback/route';

const req = () => ({ nextUrl: { searchParams: new URLSearchParams('id=777') } }) as never;

describe('GET /api/telegram/callback login branch', () => {
  beforeEach(() => {
    findUserByTelegramId.mockReset();
    isTelegramIdBanned.mockReset().mockResolvedValue(false);
    createUserSession.mockReset();
  });

  it('refuses a session for a banned user', async () => {
    findUserByTelegramId.mockResolvedValue({ id: 1, status: 'banned' });
    const res = await GET(req());
    expect(createUserSession).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://auth.example/login?error=telegram');
  });

  it('refuses a session when the telegram id is banned, even for a non-banned row', async () => {
    findUserByTelegramId.mockResolvedValue({ id: 2, status: 'active' });
    isTelegramIdBanned.mockResolvedValue(true);
    const res = await GET(req());
    expect(createUserSession).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://auth.example/login?error=telegram');
  });

  it('issues a session for an active, un-banned user', async () => {
    findUserByTelegramId.mockResolvedValue({ id: 3, status: 'active' });
    const res = await GET(req());
    expect(createUserSession).toHaveBeenCalledOnce();
    expect(res.headers.get('location')).toBe('https://auth.example/');
  });
});

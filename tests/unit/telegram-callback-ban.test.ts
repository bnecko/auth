import { describe, it, expect, vi, beforeEach } from 'vitest';

// A single-use gate lives in the login branch, so redis.set must exist; it
// returns "OK" (fresh) by default and tests override it to simulate a replay.
const redisSet = vi.fn<(...a: unknown[]) => Promise<string | null>>(async () => 'OK');
vi.mock('@/lib/server/redis', () => ({ default: { set: (...a: unknown[]) => redisSet(...a) } }));

// Signature validity is assumed; it is not what these tests cover.
vi.mock('@/lib/server/telegram', () => ({
  verifyTelegramLogin: vi.fn(() => ({ id: '777', username: 'u', firstName: 'U' })),
}));

const findUserByTelegramId = vi.fn();
vi.mock('@/lib/server/repositories/users', () => ({
  findUserByTelegramId: (...a: unknown[]) => findUserByTelegramId(...a),
}));

const isTelegramIdBanned = vi.fn();
vi.mock('@/lib/server/repositories/bans', () => ({
  isTelegramIdBanned: (...a: unknown[]) => isTelegramIdBanned(...a),
}));

const createUserSession = vi.fn();
const getSessionFromRequest =
  vi.fn<(...a: unknown[]) => Promise<null | { user: { id: number } }>>(async () => null);
vi.mock('@/lib/server/session', () => ({
  createUserSession: (...a: unknown[]) => createUserSession(...a),
  getSessionFromRequest: (...a: unknown[]) => getSessionFromRequest(...a),
}));

vi.mock('@/lib/server/config', () => ({ authBaseUrl: () => 'https://auth.example' }));

import { GET } from '@/app/api/telegram/callback/route';

const req = () => ({ nextUrl: { searchParams: new URLSearchParams('id=777&hash=abc') } }) as never;

describe('GET /api/telegram/callback login branch', () => {
  beforeEach(() => {
    findUserByTelegramId.mockReset();
    isTelegramIdBanned.mockReset().mockResolvedValue(false);
    createUserSession.mockReset();
    getSessionFromRequest.mockReset().mockResolvedValue(null);
    redisSet.mockReset().mockResolvedValue('OK');
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

  it('rejects a replayed (already-used) payload before touching the user', async () => {
    redisSet.mockResolvedValue(null);
    const res = await GET(req());
    expect(findUserByTelegramId).not.toHaveBeenCalled();
    expect(createUserSession).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://auth.example/login?error=telegram');
  });
});

describe('GET /api/telegram/callback with an existing session', () => {
  beforeEach(() => {
    findUserByTelegramId.mockReset();
    createUserSession.mockReset();
    redisSet.mockReset().mockResolvedValue('OK');
    getSessionFromRequest.mockReset().mockResolvedValue({ user: { id: 99 } });
  });

  it('never links from a bare GET: redirects to the bot-approval relink flow', async () => {
    const res = await GET(req());
    expect(res.headers.get('location')).toBe('https://auth.example/relink');
    // No linking, no session minting, no single-use burn on the link path.
    expect(findUserByTelegramId).not.toHaveBeenCalled();
    expect(createUserSession).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });
});

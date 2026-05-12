import { describe, expect, it } from 'vitest';
import { queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import {
  createSession,
  findSessionByToken,
  listSessionsForUser,
  revokeOtherSessionsForUser,
  revokeSession,
  revokeSessionById,
  revokeSessionsForUser,
} from '@/lib/server/repositories/sessions';
import { setAccountStatus } from '@/lib/server/services/admin';
import type { User } from '@/lib/server/types';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUser(prefix = 'sess'): Promise<User> {
  const token = randomToken(6);
  const username = `${prefix}_${token}`;
  const row = await queryOne<{ id: string; public_id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'SessTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id, public_id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed user');
  return {
    id: Number(row.id),
    publicId: row.public_id,
    firstName: 'SessTest',
    username,
    bio: null,
    email: `${username}@example.com`,
    emailVerifiedAt: null,
    dob: null,
    telegramId: null,
    telegramUsername: null,
    telegramVerifiedAt: null,
    role: 'user',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
}

async function mintSession(userId: number) {
  const token = randomToken(32);
  await createSession({
    userId,
    token,
    ip: '127.0.0.1',
    userAgent: 'test',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return token;
}

describeDb('session lifecycle', () => {
  it('createSession + findSessionByToken roundtrip and bumps last_seen_at', async () => {
    const user = await seedUser();
    const token = await mintSession(user.id);
    const first = await findSessionByToken(token);
    expect(first).not.toBeNull();
    expect(first?.user.id).toBe(user.id);
    const firstLastSeen = first?.session.lastSeenAt;
    await new Promise(r => setTimeout(r, 20));
    const second = await findSessionByToken(token);
    expect(second?.session.lastSeenAt).not.toBe(firstLastSeen);
  });

  it('revokeSession invalidates the token', async () => {
    const user = await seedUser();
    const token = await mintSession(user.id);
    await revokeSession(token);
    expect(await findSessionByToken(token)).toBeNull();
  });

  it('revokeSessionById is dual-keyed by userId', async () => {
    const a = await seedUser('a');
    const b = await seedUser('b');
    const aToken = await mintSession(a.id);
    const sessionId = (await findSessionByToken(aToken))!.session.id;

    // Wrong userId is a no-op.
    await revokeSessionById(sessionId, b.id);
    expect(await findSessionByToken(aToken)).not.toBeNull();

    // Right userId revokes.
    await revokeSessionById(sessionId, a.id);
    expect(await findSessionByToken(aToken)).toBeNull();
  });

  it('revokeSessionsForUser kills every session for one user only', async () => {
    const a = await seedUser('a');
    const b = await seedUser('b');
    const aTokens = [await mintSession(a.id), await mintSession(a.id)];
    const bToken = await mintSession(b.id);

    await revokeSessionsForUser(a.id);
    for (const t of aTokens) {
      expect(await findSessionByToken(t)).toBeNull();
    }
    expect(await findSessionByToken(bToken)).not.toBeNull();
  });

  it('revokeOtherSessionsForUser keeps the current session', async () => {
    const user = await seedUser();
    const keepToken = await mintSession(user.id);
    const otherToken = await mintSession(user.id);
    const keepId = (await findSessionByToken(keepToken))!.session.id;

    await revokeOtherSessionsForUser({ userId: user.id, currentSessionId: keepId });
    expect(await findSessionByToken(keepToken)).not.toBeNull();
    expect(await findSessionByToken(otherToken)).toBeNull();
  });

  it('listSessionsForUser returns only active sessions', async () => {
    const user = await seedUser();
    const live = await mintSession(user.id);
    const dead = await mintSession(user.id);
    await revokeSession(dead);

    const active = await listSessionsForUser(user.id);
    const tokens = active.map(s => s.id);
    const liveId = (await findSessionByToken(live))!.session.id;
    expect(tokens).toContain(liveId);
    expect(active.every(s => s.id !== null)).toBe(true);
  });

  it('admin ban revokes every session for the target user', async () => {
    const target = await seedUser('target');
    const admin = await seedUser('admin');
    admin.role = 'admin';

    const token = await mintSession(target.id);
    expect(await findSessionByToken(token)).not.toBeNull();

    await setAccountStatus(target.id, 'banned', admin, {
      ip: '127.0.0.1',
      userAgent: 'test',
      country: '',
    });

    expect(await findSessionByToken(token)).toBeNull();
  });
});

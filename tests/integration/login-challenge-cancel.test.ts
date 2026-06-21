import { describe, expect, it } from 'vitest';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken, hashToken } from '@/lib/server/crypto';
import {
  createLoginChallenge,
  cancelLoginChallenge,
  completeLoginChallenge,
} from '@/lib/server/repositories/loginChallenges';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUserId(prefix = 'chal') {
  const token = randomToken(6);
  const username = `${prefix}_${token}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'ChalTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed user');
  return Number(row.id);
}

async function seedApprovedChallenge(userId: number, code: string) {
  const browserToken = randomToken(12);
  const ch = await createLoginChallenge({
    publicId: publicId('tlg'),
    userId,
    startToken: randomToken(12),
    browserToken,
    remember: true,
    ip: '',
    userAgent: '',
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  await query(
    `update telegram_login_challenges set status = 'approved', code_hash = $2 where public_id = $1`,
    [ch.publicId, hashToken(code)],
  );
  return { publicId: ch.publicId, browserToken };
}

describeDb('login challenge cancellation (2FA brute-force kill switch)', () => {
  it('a cancelled challenge cannot be completed even with the correct code', async () => {
    const userId = await seedUserId();
    const code = '123456';
    const { publicId: pid, browserToken } = await seedApprovedChallenge(userId, code);

    await cancelLoginChallenge(pid);

    const result = await completeLoginChallenge({
      publicId: pid,
      browserToken,
      codeHash: hashToken(code),
    });
    expect(result).toBeNull();
  });

  it('an un-cancelled approved challenge still completes with the correct code', async () => {
    const userId = await seedUserId();
    const code = '654321';
    const { publicId: pid, browserToken } = await seedApprovedChallenge(userId, code);

    const result = await completeLoginChallenge({
      publicId: pid,
      browserToken,
      codeHash: hashToken(code),
    });
    expect(result?.publicId).toBe(pid);
  });
});

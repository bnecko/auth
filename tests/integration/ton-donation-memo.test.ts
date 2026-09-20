import { describe, expect, it } from 'vitest';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import { getOrCreateDonationMemo, donatedTotalNano } from '@/lib/server/repositories/tonDonations';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUserId() {
  const token = randomToken(6);
  const username = `memo_${token}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'MemoTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  return Number(row!.id);
}

describeDb('donation memos', () => {
  it('mints a memo from the unambiguous alphabet', async () => {
    const memo = await getOrCreateDonationMemo(await seedUserId());
    // No O/0 or I/1/l: the memo is read off one screen and typed into another.
    expect(memo).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
  });

  // A payment sent days after the page was open still has to match, so the
  // memo cannot be regenerated on each visit.
  it('keeps the same memo once issued', async () => {
    const userId = await seedUserId();
    const first = await getOrCreateDonationMemo(userId);
    expect(await getOrCreateDonationMemo(userId)).toBe(first);
  });

  it('gives different users different memos', async () => {
    const a = await getOrCreateDonationMemo(await seedUserId());
    const b = await getOrCreateDonationMemo(await seedUserId());
    expect(a).not.toBe(b);
  });

  it('survives concurrent first visits without duplicating', async () => {
    const userId = await seedUserId();
    const memos = await Promise.all([
      getOrCreateDonationMemo(userId),
      getOrCreateDonationMemo(userId),
      getOrCreateDonationMemo(userId),
    ]);
    expect(new Set(memos).size).toBe(1);
    expect(await query(`select 1 from ton_donation_memos where user_id = $1`, [userId])).toHaveLength(1);
  });

  it('goes away with the account', async () => {
    const userId = await seedUserId();
    await getOrCreateDonationMemo(userId);
    await query(`delete from users where id = $1`, [userId]);
    expect(await query(`select 1 from ton_donation_memos where user_id = $1`, [userId])).toHaveLength(0);
  });

  it('reports a zero total before anything arrives', async () => {
    expect(await donatedTotalNano(await seedUserId())).toBe('0');
  });

  // Totals stay strings: a nanocoin sum crosses 2^53 at nine coins.
  it('sums credited donations exactly', async () => {
    const userId = await seedUserId();
    await query(
      `insert into ton_donations (user_id, tx_hash, tx_lt, amount_nano, status)
       values ($1, $2, 1, '600000000', 'credited'), ($1, $3, 2, '700000000', 'credited'),
              ($1, $4, 3, '900000000', 'unmatched')`,
      [userId, `t_${randomToken(6)}`, `t_${randomToken(6)}`, `t_${randomToken(6)}`],
    );
    expect(await donatedTotalNano(userId)).toBe('1300000000');
  });
});

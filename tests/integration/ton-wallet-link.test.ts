import { describe, expect, it } from 'vitest';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import { findTonWallet, linkTonWallet, unlinkTonWallet } from '@/lib/server/repositories/tonWallets';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUserId(prefix = 'ton') {
  const token = randomToken(6);
  const username = `${prefix}_${token}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'TonTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed user');
  return Number(row.id);
}

function address(seed: string) {
  return `0:${seed.repeat(64).slice(0, 64)}`;
}

describeDb('TON wallet linking', () => {
  it('links a wallet and reads it back', async () => {
    const userId = await seedUserId();
    const result = await linkTonWallet({ userId, address: address('a'), walletVersion: 'v4r2' });

    expect(result).toMatchObject({ ok: true, displacedUserId: null });
    const wallet = await findTonWallet(userId);
    expect(wallet).toMatchObject({
      address: address('a'),
      walletVersion: 'v4r2',
      display: 'hidden',
      displayDomain: null,
    });
  });

  it('holds one wallet per user, replacing the previous address', async () => {
    const userId = await seedUserId();
    await linkTonWallet({ userId, address: address('b'), walletVersion: 'v4r2' });
    await linkTonWallet({ userId, address: address('c'), walletVersion: 'w5r1' });

    expect(await findTonWallet(userId)).toMatchObject({
      address: address('c'),
      walletVersion: 'w5r1',
    });
    const rows = await query(`select 1 from user_ton_wallets where user_id = $1`, [userId]);
    expect(rows).toHaveLength(1);
  });

  // Whoever can sign for the address takes it. Letting the first claimant keep
  // it would let someone who relayed a proof squat an address its real holder
  // could never recover.
  it('moves the address to the account that proves it last', async () => {
    const first = await seedUserId();
    const second = await seedUserId();
    await linkTonWallet({ userId: first, address: address('d'), walletVersion: 'v4r2' });

    const moved = await linkTonWallet({ userId: second, address: address('d'), walletVersion: 'v4r2' });

    expect(moved).toMatchObject({ ok: true, displacedUserId: first });
    expect(await findTonWallet(first)).toBeNull();
    expect(await findTonWallet(second)).toMatchObject({ address: address('d') });
  });

  it('keeps the address unique across accounts', async () => {
    const first = await seedUserId();
    const second = await seedUserId();
    await linkTonWallet({ userId: first, address: address('e'), walletVersion: 'v4r2' });
    await linkTonWallet({ userId: second, address: address('e'), walletVersion: 'v4r2' });

    const rows = await query(`select user_id from user_ton_wallets where address = $1`, [address('e')]);
    expect(rows).toHaveLength(1);
  });

  it('keeps display choices when the same address is proved again', async () => {
    const userId = await seedUserId();
    await linkTonWallet({ userId, address: address('f'), walletVersion: 'v4r2' });
    await query(
      `update user_ton_wallets set display = 'domain', display_domain = 'example', domain_checked_at = now()
        where user_id = $1`,
      [userId],
    );

    await linkTonWallet({ userId, address: address('f'), walletVersion: 'v4r2' });

    expect(await findTonWallet(userId)).toMatchObject({
      display: 'domain',
      displayDomain: 'example',
    });
  });

  // The domain belonged to the address being replaced, so it cannot survive a
  // move: leaving it would show a name the new address does not own.
  it('drops display choices when a different address is linked', async () => {
    const userId = await seedUserId();
    await linkTonWallet({ userId, address: address('1'), walletVersion: 'v4r2' });
    await query(
      `update user_ton_wallets set display = 'domain', display_domain = 'example', domain_checked_at = now()
        where user_id = $1`,
      [userId],
    );

    await linkTonWallet({ userId, address: address('2'), walletVersion: 'w5r1' });

    expect(await findTonWallet(userId)).toMatchObject({
      display: 'hidden',
      displayDomain: null,
      domainCheckedAt: null,
    });
  });

  it('unlinks, and reports whether there was anything to unlink', async () => {
    const userId = await seedUserId();
    await linkTonWallet({ userId, address: address('3'), walletVersion: 'v4r2' });

    expect(await unlinkTonWallet(userId)).toBe(true);
    expect(await findTonWallet(userId)).toBeNull();
    expect(await unlinkTonWallet(userId)).toBe(false);
  });

  it('goes away with the account', async () => {
    const userId = await seedUserId();
    await linkTonWallet({ userId, address: address('4'), walletVersion: 'v4r2' });

    await query(`delete from users where id = $1`, [userId]);

    const rows = await query(`select 1 from user_ton_wallets where user_id = $1`, [userId]);
    expect(rows).toHaveLength(0);
  });

  it('refuses an address that is not in raw form', async () => {
    const userId = await seedUserId();
    await expect(
      query(`insert into user_ton_wallets (user_id, address, wallet_version) values ($1, $2, 'v4r2')`, [
        userId,
        `0:${'A'.repeat(64)}`,
      ]),
    ).rejects.toThrow();
  });
});

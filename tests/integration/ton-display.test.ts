import { describe, expect, it } from 'vitest';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import {
  findTonWallet,
  linkTonWallet,
  setTonWalletDisplay,
} from '@/lib/server/repositories/tonWallets';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUserId() {
  const token = randomToken(6);
  const username = `disp_${token}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'DisplayTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed user');
  return Number(row.id);
}

const address = (seed: string) => `0:${seed.repeat(64).slice(0, 64)}`;

describeDb('TON wallet display', () => {
  it('starts hidden, so linking never publishes anything on its own', async () => {
    const userId = await seedUserId();
    await linkTonWallet({ userId, address: address('a'), walletVersion: 'v4r2' });
    expect(await findTonWallet(userId)).toMatchObject({ display: 'hidden' });
  });

  it('switches between hidden and address', async () => {
    const userId = await seedUserId();
    await linkTonWallet({ userId, address: address('b'), walletVersion: 'v4r2' });

    await setTonWalletDisplay(userId, 'address');
    expect(await findTonWallet(userId)).toMatchObject({ display: 'address' });

    await setTonWalletDisplay(userId, 'hidden');
    expect(await findTonWallet(userId)).toMatchObject({ display: 'hidden' });
  });

  // The check constraint ties the two together; leaving a stale name behind
  // would mean showing a domain the wallet is no longer being shown for.
  it('clears a stored domain when leaving domain mode', async () => {
    const userId = await seedUserId();
    await linkTonWallet({ userId, address: address('c'), walletVersion: 'v4r2' });
    await query(
      `update user_ton_wallets set display = 'domain', display_domain = 'example', domain_checked_at = now()
        where user_id = $1`,
      [userId],
    );

    await setTonWalletDisplay(userId, 'address');

    expect(await findTonWallet(userId)).toMatchObject({
      display: 'address',
      displayDomain: null,
      domainCheckedAt: null,
    });
  });

  it('reports when there is no wallet to change', async () => {
    const userId = await seedUserId();
    expect(await setTonWalletDisplay(userId, 'address')).toBe(false);
  });

  it('refuses a display mode outside the allowed set', async () => {
    const userId = await seedUserId();
    await linkTonWallet({ userId, address: address('d'), walletVersion: 'v4r2' });
    await expect(
      query(`update user_ton_wallets set display = 'everywhere' where user_id = $1`, [userId]),
    ).rejects.toThrow();
  });
});

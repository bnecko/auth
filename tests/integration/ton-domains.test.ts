import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import { findTonWallet, linkTonWallet } from '@/lib/server/repositories/tonWallets';

const requireCjs = createRequire(import.meta.url);
const { sweepTonDomains } = requireCjs('../../worker-ton.js');

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

async function seedWallet(domain: string | null, checkedHoursAgo: number | null) {
  const token = randomToken(6);
  const username = `dom_${token}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'DomainTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  const userId = Number(row!.id);
  await linkTonWallet({
    userId,
    address: `0:${randomToken(32).replace(/[^a-f0-9]/gi, '0').toLowerCase().padEnd(64, '0').slice(0, 64)}`,
    walletVersion: 'v4r2',
  });
  if (domain) {
    await query(
      `update user_ton_wallets
          set display = 'domain', display_domain = $2,
              domain_checked_at = case when $3::int is null then null else now() - ($3 || ' hours')::interval end
        where user_id = $1`,
      [userId, domain, checkedHoursAgo],
    );
  }
  return userId;
}

describeDb('TON domain sweep', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  it('leaves a recently checked domain alone', async () => {
    const userId = await seedWallet('freshname', 1);
    const ownsDomain = vi.fn(async () => true);

    await sweepTonDomains({ pool, indexer: { ownsDomain }, log, wait: async () => {} });

    const checked = (await findTonWallet(userId))!;
    expect(checked.display).toBe('domain');
    // One hour old is inside the six-hour window, so it was not even looked at.
    expect(ownsDomain).not.toHaveBeenCalledWith(checked.address, 'freshname');
  });

  it('re-stamps a stale domain that is still held', async () => {
    const userId = await seedWallet('stillmine', 12);

    await sweepTonDomains({
      pool,
      indexer: { ownsDomain: async () => true },
      log,
      wait: async () => {},
    });

    const wallet = (await findTonWallet(userId))!;
    expect(wallet.display).toBe('domain');
    expect(wallet.displayDomain).toBe('stillmine');
    expect(wallet.domainCheckedAt).not.toBeNull();
    expect(Date.now() - wallet.domainCheckedAt!.getTime()).toBeLessThan(60_000);
  });

  // The whole point of the sweep: a name that changed hands must stop
  // vouching for the account that used to hold it.
  it('hides a domain that moved to another owner and notifies', async () => {
    const userId = await seedWallet('soldaway', 12);
    const notify = vi.fn();

    await sweepTonDomains({
      pool,
      indexer: { ownsDomain: async () => false },
      log,
      notify,
      wait: async () => {},
    });

    expect(await findTonWallet(userId)).toMatchObject({
      display: 'hidden',
      displayDomain: null,
      domainCheckedAt: null,
    });
    expect(notify).toHaveBeenCalledWith(userId, 'soldaway');
  });

  it('leaves everything untouched while the indexer is unreachable', async () => {
    const userId = await seedWallet('outagename', 12);
    const notify = vi.fn();

    const ok = await sweepTonDomains({
      pool,
      indexer: {
        ownsDomain: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
      log,
      notify,
      wait: async () => {},
    });

    expect(ok).toBe(false);
    expect(await findTonWallet(userId)).toMatchObject({
      display: 'domain',
      displayDomain: 'outagename',
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('picks up a domain that has never been checked', async () => {
    const userId = await seedWallet('neverchecked', null);

    await sweepTonDomains({
      pool,
      indexer: { ownsDomain: async () => true },
      log,
      wait: async () => {},
    });

    expect((await findTonWallet(userId))!.domainCheckedAt).not.toBeNull();
  });
});

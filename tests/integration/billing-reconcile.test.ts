import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import { creditDeposit, NANO_PER_GRAM } from '@/lib/server/repositories/billing';

const requireCjs = createRequire(import.meta.url);
const { reconcileBilling } = requireCjs('../../worker-ton.js');

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const OWNER = '0:147b97d2b37a9e0e9dcbdb20bc636864d3a18fac2cf8f0a2aca195ac77ebedc0';

// Reconciliation is global by nature, so a case asserts on what it is about
// rather than on the ledger being silent overall.
function alertText(alerts: { send: ReturnType<typeof vi.fn> }) {
  return alerts.send.mock.calls.map(call => String(call[1])).join(' ');
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function seedUserId() {
  const username = `rec_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'RecTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  return Number(row!.id);
}

describeDb('billing reconciliation', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // Larger than anything the suite can put in the ledger. An earlier value of
  // a million GRAM was not: another file deliberately credits 1.23e17 nano to
  // prove amounts survive past the float range, which legitimately tripped the
  // chain check.
  const plenty = { accountBalance: async () => (10n ** 30n).toString() };

  // These assertions are about the whole ledger, and the suite shares one
  // database, so anything another file left behind would read as drift here.
  // Start each case from a ledger whose cached balances match their entries.
  beforeEach(async () => {
    await query(
      `update billing_balances b
          set balance_nano = coalesce(
                (select sum(e.amount_nano) from billing_entries e where e.account_id = b.account_id), 0)`,
    );
  });

  it('passes on a healthy ledger and says what is owed', async () => {
    const log = logger();
    const alerts = { send: vi.fn() };
    await creditDeposit({
      userId: await seedUserId(),
      amountNano: 2n * NANO_PER_GRAM,
      txHash: `rec_${randomToken(6)}`,
    });

    expect(
      await reconcileBilling({ pool, indexer: plenty, log, alerts, ownerAddress: OWNER }),
    ).toBe(true);
    // Asserting no alert at all would depend on every other file's leftovers,
    // since reconciliation reads the whole ledger. Assert the thing this case
    // is about: a freshly credited account does not read as drift.
    expect(alertText(alerts)).not.toContain('disagree with their entries');
  });

  // The cached balance is what a user is shown; if it stops matching the
  // entries behind it, the figure is fiction.
  it('reports a balance that disagrees with its entries', async () => {
    const userId = await seedUserId();
    await creditDeposit({ userId, amountNano: NANO_PER_GRAM, txHash: `rec_${randomToken(6)}` });
    await query(
      `update billing_balances set balance_nano = balance_nano + 5
        where account_id = (select id from billing_accounts where user_id = $1)`,
      [userId],
    );

    const log = logger();
    const alerts = { send: vi.fn() };
    await reconcileBilling({ pool, indexer: plenty, log, alerts, ownerAddress: OWNER });

    expect(alerts.send).toHaveBeenCalledWith(
      'billing_drift',
      expect.stringContaining('disagree with their entries'),
      expect.anything(),
    );

    await query(
      `update billing_balances set balance_nano = balance_nano - 5
        where account_id = (select id from billing_accounts where user_id = $1)`,
      [userId],
    );
  });

  // Owing more than the address holds means the books claim money that is not
  // there. The reverse is normal: donations are gifts, not obligations.
  it('reports owing more than the chain holds, and tolerates holding more', async () => {
    // Credits its own balance rather than relying on earlier cases, so the
    // comparison has something to be true about whatever ran before.
    await creditDeposit({
      userId: await seedUserId(),
      amountNano: NANO_PER_GRAM,
      txHash: `rec_${randomToken(6)}`,
    });
    const log = logger();
    const alerts = { send: vi.fn() };
    await reconcileBilling({
      pool,
      indexer: { accountBalance: async () => '1' },
      log,
      alerts,
      ownerAddress: OWNER,
    });
    expect(alerts.send).toHaveBeenCalledWith(
      'billing_drift',
      expect.stringContaining('exceeds'),
      expect.anything(),
    );

    const quiet = { send: vi.fn() };
    await reconcileBilling({ pool, indexer: plenty, log: logger(), alerts: quiet, ownerAddress: OWNER });
    expect(alertText(quiet)).not.toContain('exceeds');
  });

  // A request with no hold behind it is a payout queued against money that is
  // still free to be spent.
  it('reports open withdrawals that escrow does not cover', async () => {
    const userId = await seedUserId();
    await creditDeposit({ userId, amountNano: NANO_PER_GRAM, txHash: `rec_${randomToken(6)}` });
    const unbacked = await queryOne<{ id: string }>(
      `insert into billing_withdrawals (account_id, user_id, amount_nano, destination, memo)
       select id, $1, 700, $2, $3 from billing_accounts where user_id = $1
       returning id`,
      [userId, `0:${'a'.repeat(64)}`, `REC${randomToken(4)}`],
    );

    const alerts = { send: vi.fn() };
    await reconcileBilling({ pool, indexer: plenty, log: logger(), alerts, ownerAddress: OWNER });

    expect(alerts.send).toHaveBeenCalledWith(
      'billing_drift',
      expect.stringContaining('open withdrawals total'),
      expect.anything(),
    );

    await query(`delete from billing_withdrawals where id = $1`, [unbacked!.id]);
  });

  // An unreachable vendor is not a discrepancy and must not page anyone.
  it('stays quiet when the chain cannot be read', async () => {
    const log = logger();
    const alerts = { send: vi.fn() };
    const ok = await reconcileBilling({
      pool,
      indexer: {
        accountBalance: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
      log,
      alerts,
      ownerAddress: OWNER,
    });

    expect(ok).toBe(true);
    expect(alerts.send).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('billing_reconcile_chain_unreachable', expect.anything());
  });

  it('skips the chain check when no deposit address is configured', async () => {
    const alerts = { send: vi.fn() };
    const accountBalance = vi.fn();
    await reconcileBilling({ pool, indexer: { accountBalance }, log: logger(), alerts, ownerAddress: '' });
    expect(accountBalance).not.toHaveBeenCalled();
  });
});

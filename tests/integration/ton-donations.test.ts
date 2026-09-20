import { createRequire } from 'node:module';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { beginCell } from '@ton/core';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';

const requireCjs = createRequire(import.meta.url);
const { sweepTonDonations, DONATION_CURSOR } = requireCjs('../../worker-ton.js');

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const OWNER = '0:7dadb32dadc47eeb136d2c10c2a2b2b91302a8079caac544d17de37f266f3df1';
const SENDER = '0:f70ff98c567057c2f15ba7b6304f09baa41bf50752c82bd121829b2b48d959f8';

async function seedUserWithMemo(memo: string) {
  const token = randomToken(6);
  const username = `don_${token}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'DonorTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  const userId = Number(row!.id);
  await query(`insert into ton_donation_memos (user_id, memo) values ($1, $2)`, [userId, memo]);
  return userId;
}

function transfer({ lt, value, memo, hash }: { lt: string; value: string; memo?: string; hash?: string }) {
  return {
    hash: hash ?? `h_${lt}`,
    lt,
    now: 1789929452,
    emulated: false,
    finality: 'finalized',
    description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
    in_msg: {
      source: SENDER,
      destination: OWNER,
      value,
      opcode: '0x00000000',
      bounced: false,
      message_content: memo
        ? { body: beginCell().storeUint(0, 32).storeStringTail(memo).endCell().toBoc().toString('base64') }
        : undefined,
    },
  };
}

const indexerOf = (transactions: unknown[], latest = '100') => ({
  accountTransactions: vi.fn(async () => transactions),
  latestLt: vi.fn(async () => latest),
});

async function cursorValue(pool: Pool) {
  const { rows } = await pool.query(`select value from worker_cursors where name = $1`, [DONATION_CURSOR]);
  return rows[0]?.value ?? null;
}

async function donorSince(userId: number) {
  const row = await queryOne<{ donor_since: Date | null }>(`select donor_since from users where id = $1`, [userId]);
  return row?.donor_since ?? null;
}

describeDb('TON donation ingestion', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeEach(async () => {
    await query(`delete from worker_cursors where name = $1`, [DONATION_CURSOR]);
  });

  it('does nothing without a donation address', async () => {
    const indexer = indexerOf([]);
    expect(await sweepTonDonations({ pool, indexer, log, ownerAddress: '' })).toBe(true);
    expect(indexer.latestLt).not.toHaveBeenCalled();
  });

  // Starting from the present, so turning the feature on does not retroactively
  // credit every payment the address ever received.
  it('starts the cursor at the present on its first run', async () => {
    const indexer = indexerOf([], '5000');
    await sweepTonDonations({ pool, indexer, log, ownerAddress: OWNER });

    expect(await cursorValue(pool)).toBe('5000');
    expect(indexer.accountTransactions).not.toHaveBeenCalled();
  });

  it('credits a transfer whose memo matches, and grants the badge at one GRAM', async () => {
    const memo = `M${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
    const userId = await seedUserWithMemo(memo);
    await pool.query(`insert into worker_cursors (name, value) values ($1, '1')`, [DONATION_CURSOR]);
    const notify = vi.fn();

    await sweepTonDonations({
      pool,
      indexer: indexerOf([transfer({ lt: '10', value: '1000000000', memo })]),
      log,
      notify,
      ownerAddress: OWNER,
    });

    const rows = await query<{ status: string; amount_nano: string }>(
      `select status, amount_nano from ton_donations where user_id = $1`,
      [userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'credited', amount_nano: '1000000000' });
    expect(await donorSince(userId)).not.toBeNull();
    expect(notify).toHaveBeenCalledWith(userId);
    expect(await cursorValue(pool)).toBe('10');
  });

  // An exchange withdrawal arrives with its fee taken out, so a single "send
  // 1 GRAM" lands just under the line. The threshold is on the running total.
  it('adds donations up rather than requiring one big enough transfer', async () => {
    const memo = `N${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
    const userId = await seedUserWithMemo(memo);
    await pool.query(`insert into worker_cursors (name, value) values ($1, '1')`, [DONATION_CURSOR]);

    await sweepTonDonations({
      pool,
      indexer: indexerOf([transfer({ lt: '11', value: '600000000', memo, hash: 'a1' })]),
      log,
      ownerAddress: OWNER,
    });
    expect(await donorSince(userId)).toBeNull();

    await pool.query(`update worker_cursors set value = '11' where name = $1`, [DONATION_CURSOR]);
    await sweepTonDonations({
      pool,
      indexer: indexerOf([transfer({ lt: '12', value: '600000000', memo, hash: 'a2' })]),
      log,
      ownerAddress: OWNER,
    });
    expect(await donorSince(userId)).not.toBeNull();
  });

  it('ignores a transaction it has already recorded', async () => {
    const memo = `R${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
    const userId = await seedUserWithMemo(memo);
    await pool.query(`insert into worker_cursors (name, value) values ($1, '1')`, [DONATION_CURSOR]);
    const tx = transfer({ lt: '20', value: '2000000000', memo, hash: 'replayed' });

    for (const _ of [1, 2, 3]) {
      await pool.query(`update worker_cursors set value = '1' where name = $1`, [DONATION_CURSOR]);
      await sweepTonDonations({ pool, indexer: indexerOf([tx]), log, ownerAddress: OWNER });
    }

    const rows = await query(`select 1 from ton_donations where user_id = $1`, [userId]);
    expect(rows).toHaveLength(1);
  });

  it('records a payment with an unknown memo as unmatched', async () => {
    await pool.query(`insert into worker_cursors (name, value) values ($1, '1')`, [DONATION_CURSOR]);
    await sweepTonDonations({
      pool,
      indexer: indexerOf([transfer({ lt: '30', value: '5000000000', memo: 'NOSUCHMEMO', hash: 'u1' })]),
      log,
      ownerAddress: OWNER,
    });

    const rows = await query<{ status: string; user_id: string | null }>(
      `select status, user_id from ton_donations where tx_hash = 'u1'`,
    );
    expect(rows[0]).toMatchObject({ status: 'unmatched', user_id: null });
  });

  // A public address can be sprayed with fractions of a coin; the ledger is
  // not a place strangers get to write to for free.
  it('drops unmatched dust without storing it', async () => {
    await pool.query(`insert into worker_cursors (name, value) values ($1, '1')`, [DONATION_CURSOR]);
    await sweepTonDonations({
      pool,
      indexer: indexerOf([transfer({ lt: '31', value: '1000', hash: 'dust1' })]),
      log,
      ownerAddress: OWNER,
    });

    expect(await query(`select 1 from ton_donations where tx_hash = 'dust1'`)).toHaveLength(0);
    // The cursor still moves, or the same dust would be re-read forever.
    expect(await cursorValue(pool)).toBe('31');
  });

  // Advancing past something that has not settled would lose it for good.
  it('stops at the first transaction that is not final', async () => {
    await pool.query(`insert into worker_cursors (name, value) values ($1, '1')`, [DONATION_CURSOR]);
    const settled = transfer({ lt: '40', value: '2000000000', hash: 'f1' });
    const pending = { ...transfer({ lt: '41', value: '2000000000', hash: 'f2' }), finality: 'pending' };
    const after = transfer({ lt: '42', value: '2000000000', hash: 'f3' });

    await sweepTonDonations({ pool, indexer: indexerOf([settled, pending, after]), log, ownerAddress: OWNER });

    expect(await cursorValue(pool)).toBe('40');
    expect(await query(`select 1 from ton_donations where tx_hash in ('f2','f3')`)).toHaveLength(0);
  });

  it('leaves the cursor alone when the indexer is unreachable', async () => {
    await pool.query(`insert into worker_cursors (name, value) values ($1, '77')`, [DONATION_CURSOR]);
    const alerts = { send: vi.fn() };

    const ok = await sweepTonDonations({
      pool,
      indexer: {
        accountTransactions: async () => {
          throw new Error('ECONNREFUSED');
        },
        latestLt: async () => '0',
      },
      log,
      alerts,
      ownerAddress: OWNER,
    });

    expect(ok).toBe(false);
    expect(await cursorValue(pool)).toBe('77');
    expect(alerts.send).toHaveBeenCalled();
  });

  it('keeps the record but detaches the person when an account is deleted', async () => {
    const memo = `D${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
    const userId = await seedUserWithMemo(memo);
    await pool.query(`insert into worker_cursors (name, value) values ($1, '1')`, [DONATION_CURSOR]);
    await sweepTonDonations({
      pool,
      indexer: indexerOf([transfer({ lt: '50', value: '3000000000', memo, hash: 'keep1' })]),
      log,
      ownerAddress: OWNER,
    });

    await query(`delete from users where id = $1`, [userId]);

    const rows = await query<{ user_id: string | null }>(
      `select user_id from ton_donations where tx_hash = 'keep1'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeNull();
  });
});

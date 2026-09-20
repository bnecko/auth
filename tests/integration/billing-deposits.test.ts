import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { beginCell } from '@ton/core';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import { getBalanceNano } from '@/lib/server/repositories/billing';
import { getOrCreateDepositMemo, getOrCreateDonationMemo } from '@/lib/server/repositories/tonDonations';

const requireCjs = createRequire(import.meta.url);
const { sweepTonDonations, resolveMemo, DONATION_CURSOR } = requireCjs('../../worker-ton.js');

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const OWNER = '0:147b97d2b37a9e0e9dcbdb20bc636864d3a18fac2cf8f0a2aca195ac77ebedc0';

async function seedUserId() {
  const username = `dep_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'DepTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  return Number(row!.id);
}

function transfer({ lt, value, memo, hash }: { lt: string; value: string; memo?: string; hash: string }) {
  return {
    hash,
    lt,
    now: 1789929452,
    emulated: false,
    finality: 'finalized',
    description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
    in_msg: {
      source: `0:${'f'.repeat(64)}`,
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

const indexerOf = (txs: unknown[]) => ({
  accountTransactions: vi.fn(async () => txs),
  latestLt: vi.fn(async () => '1'),
});

describeDb('btGRAM deposits', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  async function atCursor(value: string) {
    await pool.query(
      `insert into worker_cursors (name, value) values ($1, $2)
       on conflict (name) do update set value = excluded.value`,
      [DONATION_CURSOR, value],
    );
  }

  // The memo is the only thing separating a gift from a spendable claim, so
  // telling them apart is the whole job.
  it('tells a deposit memo from a donation memo', async () => {
    const userId = await seedUserId();
    const deposit = await getOrCreateDepositMemo(userId);
    const donation = await getOrCreateDonationMemo(userId);

    expect(deposit).not.toBe(donation);
    expect(await resolveMemo(pool, deposit)).toEqual({ userId, purpose: 'deposit' });
    expect(await resolveMemo(pool, donation)).toEqual({ userId, purpose: 'donation' });
    expect(await resolveMemo(pool, 'NOSUCHMEMO')).toBeNull();
    expect(await resolveMemo(pool, null)).toBeNull();
  });

  it('credits a deposit to the balance and not to the donation ledger', async () => {
    const userId = await seedUserId();
    const memo = await getOrCreateDepositMemo(userId);
    const hash = `dep_${randomToken(6)}`;
    await atCursor('1');
    const creditDeposit = vi.fn(async () => ({ ok: true }));

    await sweepTonDonations({
      pool,
      indexer: indexerOf([transfer({ lt: '900', value: '2000000000', memo, hash })]),
      log,
      ownerAddress: OWNER,
      creditDeposit,
    });

    expect(creditDeposit).toHaveBeenCalledWith({ userId, amountNano: '2000000000', txHash: hash });
    expect(await query(`select 1 from ton_donations where tx_hash = $1`, [hash])).toHaveLength(0);
  });

  // Someone's money: skipping past it would lose the deposit for good, so the
  // cursor has to stay behind the transaction that failed.
  it('leaves the cursor behind a deposit it could not credit', async () => {
    const userId = await seedUserId();
    const memo = await getOrCreateDepositMemo(userId);
    await atCursor('1');

    const ok = await sweepTonDonations({
      pool,
      indexer: indexerOf([
        transfer({ lt: '910', value: '1000000000', memo, hash: `f1_${randomToken(4)}` }),
        transfer({ lt: '911', value: '1000000000', memo, hash: `f2_${randomToken(4)}` }),
      ]),
      log,
      ownerAddress: OWNER,
      creditDeposit: async () => {
        throw new Error('app unreachable');
      },
    });

    expect(ok).toBe(true);
    const { rows } = await pool.query(`select value from worker_cursors where name = $1`, [DONATION_CURSOR]);
    expect(rows[0].value).toBe('1');
  });

  it('still records a donation memo as a donation', async () => {
    const userId = await seedUserId();
    const memo = await getOrCreateDonationMemo(userId);
    const hash = `don_${randomToken(6)}`;
    await atCursor('1');
    const creditDeposit = vi.fn();

    await sweepTonDonations({
      pool,
      indexer: indexerOf([transfer({ lt: '920', value: '1500000000', memo, hash })]),
      log,
      ownerAddress: OWNER,
      creditDeposit,
    });

    expect(creditDeposit).not.toHaveBeenCalled();
    const rows = await query<{ status: string }>(`select status from ton_donations where tx_hash = $1`, [hash]);
    expect(rows[0]).toMatchObject({ status: 'credited' });
    expect(await getBalanceNano(userId)).toBe('0');
  });

  it('gives each user their own deposit memo and keeps it stable', async () => {
    const a = await seedUserId();
    const b = await seedUserId();
    const first = await getOrCreateDepositMemo(a);

    expect(await getOrCreateDepositMemo(a)).toBe(first);
    expect(await getOrCreateDepositMemo(b)).not.toBe(first);
    expect(first).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
  });
});

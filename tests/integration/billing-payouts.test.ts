import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { beginCell } from '@ton/core';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import { creditDeposit, NANO_PER_GRAM } from '@/lib/server/repositories/billing';
import {
  approveWithdrawal,
  confirmWithdrawalPayment,
  requestWithdrawal,
} from '@/lib/server/repositories/billingWithdrawals';

const requireCjs = createRequire(import.meta.url);
const { sweepTonDonations, parsePayouts, DONATION_CURSOR } = requireCjs('../../worker-ton.js');

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const OWNER = '0:147b97d2b37a9e0e9dcbdb20bc636864d3a18fac2cf8f0a2aca195ac77ebedc0';
const randomAddress = () => `0:${randomBytes(32).toString('hex')}`;

const commentBody = (text: string) =>
  beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64');

type OutMsg = { destination: string; value: string; memo?: string; opcode?: string };

// A transaction at the operator's wallet as the indexer reports it: triggered
// by an external message, so no in_msg source, with the payments in out_msgs.
function payoutTx({ lt, hash, out, aborted = false }: { lt: string; hash: string; out: OutMsg[]; aborted?: boolean }) {
  return {
    hash,
    lt,
    now: 1789929452,
    emulated: false,
    finality: 'finalized',
    description: { aborted, compute_ph: { success: true }, action: { success: !aborted } },
    in_msg: { source: null, destination: OWNER, value: '0' },
    out_msgs: out.map(msg => ({
      source: OWNER,
      // The indexer reports raw addresses in upper case.
      destination: msg.destination.toUpperCase(),
      value: msg.value,
      opcode: msg.opcode ?? '0x00000000',
      message_content: msg.memo ? { body: commentBody(msg.memo) } : undefined,
    })),
  };
}

describe('reading payouts out of a transaction', () => {
  const destination = randomAddress();

  it('returns each commented transfer with the address in stored form', () => {
    const tx = payoutTx({ lt: '5', hash: 'h1', out: [{ destination, value: '2000000000', memo: ' abcd2345ef ' }] });

    expect(parsePayouts(tx, OWNER)).toEqual([
      { txHash: 'h1', destination, amountNano: 2000000000n, memo: 'ABCD2345EF' },
    ]);
  });

  it('reads every payment of a batch', () => {
    const tx = payoutTx({
      lt: '5',
      hash: 'h2',
      out: [
        { destination, value: '1', memo: 'AAAA' },
        { destination: randomAddress(), value: '2', memo: 'BBBB' },
      ],
    });
    expect(parsePayouts(tx, OWNER).map((p: { memo: string }) => p.memo)).toEqual(['AAAA', 'BBBB']);
  });

  // An aborted transaction sent nothing, whatever its message list says.
  it('reads nothing from an aborted transaction', () => {
    const tx = payoutTx({ lt: '5', hash: 'h3', aborted: true, out: [{ destination, value: '1', memo: 'AAAA' }] });
    expect(parsePayouts(tx, OWNER)).toEqual([]);
  });

  // A jetton transfer is an outbound message too, and its value is gas, not a
  // payout.
  it('ignores a message that is not a plain transfer', () => {
    const tx = payoutTx({
      lt: '5',
      hash: 'h4',
      out: [{ destination, value: '50000000', memo: 'AAAA', opcode: '0x0f8a7ea5' }],
    });
    expect(parsePayouts(tx, OWNER)).toEqual([]);
  });

  it('ignores a transfer with no comment', () => {
    const tx = payoutTx({ lt: '5', hash: 'h5', out: [{ destination, value: '1' }] });
    expect(parsePayouts(tx, OWNER)).toEqual([]);
  });

  it('reads nothing from an ordinary inbound transaction', () => {
    expect(parsePayouts({ hash: 'h6', lt: '5', description: {}, in_msg: { source: destination } }, OWNER)).toEqual([]);
  });
});

describeDb('confirming withdrawals from the chain', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  // What worker.js wires in, minus the loopback: the same repository call the
  // internal endpoint makes.
  const confirmWithdrawal = (payload: { memo: string; txHash: string; destination: string; amountNano: string }) =>
    confirmWithdrawalPayment({ ...payload, amountNano: BigInt(payload.amountNano) });

  const indexerOf = (txs: unknown[]) => ({
    accountTransactions: vi.fn(async () => txs),
    latestLt: vi.fn(async () => '1'),
  });

  async function atCursor(value: string) {
    await pool.query(
      `insert into worker_cursors (name, value) values ($1, $2)
       on conflict (name) do update set value = excluded.value`,
      [DONATION_CURSOR, value],
    );
  }

  async function cursor() {
    const { rows } = await pool.query(`select value from worker_cursors where name = $1`, [DONATION_CURSOR]);
    return rows[0].value;
  }

  async function approvedWithdrawal() {
    const username = `pay_${randomToken(6)}`;
    const user = await queryOne<{ id: string }>(
      `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
       values ($1, 'PayTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
       returning id`,
      [publicId('usr'), username, `${username}@example.com`],
    );
    const userId = Number(user!.id);
    await query(`insert into kyc_applications (user_id, status) values ($1, 'approved')`, [userId]);
    await query(
      `insert into user_ton_wallets (user_id, address, wallet_version) values ($1, $2, 'v4r2')`,
      [userId, randomAddress()],
    );
    await creditDeposit({ userId, amountNano: 3n * NANO_PER_GRAM, txHash: `tx_${randomToken(6)}` });

    const withdrawal = await requestWithdrawal({ userId, amountNano: NANO_PER_GRAM });
    await approveWithdrawal({ withdrawalId: withdrawal.id, adminId: userId });
    return withdrawal;
  }

  async function statusOf(withdrawalId: number) {
    const row = await queryOne<{ status: string; tx_hash: string | null }>(
      `select status, tx_hash from billing_withdrawals where id = $1`,
      [withdrawalId],
    );
    return row!;
  }

  it('confirms an approved withdrawal when its payment appears on chain', async () => {
    const withdrawal = await approvedWithdrawal();
    const hash = `out_${randomToken(6)}`;
    await atCursor('1');

    await sweepTonDonations({
      pool,
      indexer: indexerOf([
        payoutTx({
          lt: '950',
          hash,
          out: [{ destination: withdrawal.destination, value: withdrawal.amountNano, memo: withdrawal.memo }],
        }),
      ]),
      log,
      ownerAddress: OWNER,
      confirmWithdrawal,
    });

    expect(await statusOf(withdrawal.id)).toEqual({ status: 'confirmed', tx_hash: hash });
    expect(await cursor()).toBe('950');
  });

  // The operator's wallet did something the queue did not ask for. It must not
  // settle anything, and it must not pass quietly.
  it('alerts and settles nothing when the payment went to the wrong address', async () => {
    const withdrawal = await approvedWithdrawal();
    const alerts = { send: vi.fn() };
    await atCursor('1');

    await sweepTonDonations({
      pool,
      indexer: indexerOf([
        payoutTx({
          lt: '960',
          hash: `out_${randomToken(6)}`,
          out: [{ destination: randomAddress(), value: withdrawal.amountNano, memo: withdrawal.memo }],
        }),
      ]),
      log,
      alerts,
      ownerAddress: OWNER,
      confirmWithdrawal,
    });

    expect((await statusOf(withdrawal.id)).status).toBe('approved');
    expect(alerts.send).toHaveBeenCalledWith(
      expect.stringContaining('withdrawal_payment_refused'),
      expect.stringContaining(`#${withdrawal.id}`),
      expect.anything(),
    );
  });

  // A payout that was made but never recorded would hold the user's balance
  // forever, so the cursor has to wait for the report to get through.
  it('leaves the cursor behind a payout it could not report', async () => {
    const withdrawal = await approvedWithdrawal();
    await atCursor('1');

    await sweepTonDonations({
      pool,
      indexer: indexerOf([
        payoutTx({
          lt: '970',
          hash: `out_${randomToken(6)}`,
          out: [{ destination: withdrawal.destination, value: withdrawal.amountNano, memo: withdrawal.memo }],
        }),
      ]),
      log,
      ownerAddress: OWNER,
      confirmWithdrawal: async () => {
        throw new Error('app unreachable');
      },
    });

    expect(await cursor()).toBe('1');
    expect((await statusOf(withdrawal.id)).status).toBe('approved');
  });

  it('steps over an outbound payment that is not a withdrawal', async () => {
    await atCursor('1');

    await sweepTonDonations({
      pool,
      indexer: indexerOf([
        payoutTx({ lt: '980', hash: `out_${randomToken(6)}`, out: [{ destination: randomAddress(), value: '5', memo: 'lunch' }] }),
      ]),
      log,
      ownerAddress: OWNER,
      confirmWithdrawal,
    });

    expect(await cursor()).toBe('980');
  });
});

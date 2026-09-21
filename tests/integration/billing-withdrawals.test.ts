import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { query, queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import {
  creditDeposit,
  findBalanceDrift,
  getBalanceNano,
  getPoolBalanceNano,
  InsufficientBalance,
  NANO_PER_GRAM,
} from '@/lib/server/repositories/billing';
import {
  approveWithdrawal,
  cancelWithdrawal,
  confirmWithdrawalPayment,
  markWithdrawalSent,
  rejectWithdrawal,
  requestWithdrawal,
  type Withdrawal,
} from '@/lib/server/repositories/billingWithdrawals';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const gram = (n: number) => BigInt(n) * NANO_PER_GRAM;
const randomAddress = () => `0:${randomBytes(32).toString('hex')}`;

async function seedUserId(prefix = 'wd') {
  const username = `${prefix}_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'WdTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  return Number(row!.id);
}

async function approveIdentity(userId: number) {
  await query(
    `insert into kyc_applications (user_id, session_id, status) values ($1, $2, 'approved')`,
    [userId, `sess_${randomToken(8)}`],
  );
}

async function linkWallet(userId: number, address = randomAddress()) {
  await query(
    `insert into user_ton_wallets (user_id, address, wallet_version) values ($1, $2, 'v4r2')`,
    [userId, address],
  );
  return address;
}

// A user who clears the whole gate and holds `balance` GRAM.
async function seedWithdrawer(balance = 5) {
  const userId = await seedUserId();
  await approveIdentity(userId);
  const address = await linkWallet(userId);
  await creditDeposit({ userId, amountNano: gram(balance), txHash: `tx_${randomToken(6)}` });
  return { userId, address };
}

async function escrowNano() {
  const row = await queryOne<{ balance_nano: string }>(
    `select b.balance_nano from billing_balances b
       join billing_accounts a on a.id = b.account_id where a.kind = 'escrow'`,
  );
  return BigInt(row!.balance_nano);
}

async function statusOf(withdrawalId: number) {
  const row = await queryOne<{ status: string; tx_hash: string | null }>(
    `select status, tx_hash from billing_withdrawals where id = $1`,
    [withdrawalId],
  );
  return row!;
}

const paymentFor = (withdrawal: Withdrawal, overrides: Partial<Parameters<typeof confirmWithdrawalPayment>[0]> = {}) => ({
  memo: withdrawal.memo,
  txHash: `out_${randomToken(8)}`,
  destination: withdrawal.destination,
  amountNano: BigInt(withdrawal.amountNano),
  ...overrides,
});

describeDb('btGRAM withdrawals', () => {
  describe('requesting', () => {
    it('moves the amount out of the spendable balance and into escrow', async () => {
      const { userId, address } = await seedWithdrawer(5);
      const escrowBefore = await escrowNano();

      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });

      expect(withdrawal.status).toBe('requested');
      expect(withdrawal.destination).toBe(address);
      expect(await getBalanceNano(userId)).toBe('3000000000');
      expect((await escrowNano()) - escrowBefore).toBe(gram(2));
    });

    it('refuses an account whose identity is not approved', async () => {
      const userId = await seedUserId();
      await linkWallet(userId);
      await creditDeposit({ userId, amountNano: gram(1), txHash: `tx_${randomToken(6)}` });

      await expect(requestWithdrawal({ userId, amountNano: gram(1) })).rejects.toMatchObject({
        reason: 'identity_not_verified',
      });
      expect(await getBalanceNano(userId)).toBe('1000000000');
    });

    it('refuses an account with no verified wallet to pay', async () => {
      const userId = await seedUserId();
      await approveIdentity(userId);
      await creditDeposit({ userId, amountNano: gram(1), txHash: `tx_${randomToken(6)}` });

      await expect(requestWithdrawal({ userId, amountNano: gram(1) })).rejects.toMatchObject({
        reason: 'no_wallet',
      });
    });

    it('refuses an amount below the minimum', async () => {
      const { userId } = await seedWithdrawer(1);
      await expect(requestWithdrawal({ userId, amountNano: 1n })).rejects.toMatchObject({
        reason: 'below_minimum',
      });
    });

    // The request row and the hold share a transaction, so an overdraft must
    // take the row down with it rather than leave a request backed by nothing.
    it('leaves no request behind when the balance cannot cover it', async () => {
      const { userId } = await seedWithdrawer(1);

      await expect(requestWithdrawal({ userId, amountNano: gram(2) })).rejects.toBeInstanceOf(
        InsufficientBalance,
      );

      const rows = await query(`select 1 from billing_withdrawals where user_id = $1`, [userId]);
      expect(rows).toHaveLength(0);
      expect(await getBalanceNano(userId)).toBe('1000000000');
    });

    it('allows one open withdrawal at a time', async () => {
      const { userId } = await seedWithdrawer(5);
      await requestWithdrawal({ userId, amountNano: gram(1) });

      await expect(requestWithdrawal({ userId, amountNano: gram(1) })).rejects.toMatchObject({
        reason: 'already_open',
      });
      expect(await getBalanceNano(userId)).toBe('4000000000');
    });
  });

  describe('closing without payment', () => {
    it('returns the hold when the user cancels', async () => {
      const { userId } = await seedWithdrawer(5);
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });

      expect(await cancelWithdrawal({ userId, withdrawalId: withdrawal.id })).toBe(true);

      expect((await statusOf(withdrawal.id)).status).toBe('cancelled');
      expect(await getBalanceNano(userId)).toBe('5000000000');
    });

    // The operator may be paying an approved request right now; a cancel that
    // won that race would give the user the GRAM and the balance.
    it('does not let the user cancel once it is approved', async () => {
      const { userId } = await seedWithdrawer(5);
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });
      await approveWithdrawal({ withdrawalId: withdrawal.id, adminId: userId });

      expect(await cancelWithdrawal({ userId, withdrawalId: withdrawal.id })).toBe(false);
      expect(await getBalanceNano(userId)).toBe('3000000000');
    });

    it("does not let one user cancel another's withdrawal", async () => {
      const { userId } = await seedWithdrawer(5);
      const stranger = await seedUserId();
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });

      expect(await cancelWithdrawal({ userId: stranger, withdrawalId: withdrawal.id })).toBe(false);
      expect((await statusOf(withdrawal.id)).status).toBe('requested');
    });

    it('returns the hold when the operator rejects', async () => {
      const { userId } = await seedWithdrawer(5);
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });

      const rejected = await rejectWithdrawal({ withdrawalId: withdrawal.id, adminId: userId, reason: 'test' });

      // Whose it was and how much, which is what the decline notice is built from.
      expect(rejected).toEqual({ userId, amountNano: '2000000000' });
      expect((await statusOf(withdrawal.id)).status).toBe('rejected');
      expect(await getBalanceNano(userId)).toBe('5000000000');
    });

    // Once the operator says the GRAM has left, returning the balance as well
    // would pay the withdrawal twice.
    it('cannot be rejected after it is marked sent', async () => {
      const { userId } = await seedWithdrawer(5);
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });
      await approveWithdrawal({ withdrawalId: withdrawal.id, adminId: userId });
      await markWithdrawalSent(withdrawal.id);

      expect(
        await rejectWithdrawal({ withdrawalId: withdrawal.id, adminId: userId, reason: null }),
      ).toBeNull();
      expect(await getBalanceNano(userId)).toBe('3000000000');
    });

    it('sends the hold to the pool when the account was purged meanwhile', async () => {
      const { userId } = await seedWithdrawer(5);
      const admin = await seedUserId('wdadmin');
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });
      await query(`delete from users where id = $1`, [userId]);
      const poolBefore = BigInt(await getPoolBalanceNano());

      await rejectWithdrawal({ withdrawalId: withdrawal.id, adminId: admin, reason: null });

      expect(BigInt(await getPoolBalanceNano()) - poolBefore).toBe(gram(2));
    });
  });

  describe('approval', () => {
    it('re-checks that the destination is still the linked wallet', async () => {
      const { userId } = await seedWithdrawer(5);
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });
      await query(`update user_ton_wallets set address = $2 where user_id = $1`, [userId, randomAddress()]);

      expect(await approveWithdrawal({ withdrawalId: withdrawal.id, adminId: userId })).toBe(false);
      expect((await statusOf(withdrawal.id)).status).toBe('requested');
    });

    it('re-checks that the identity is still approved', async () => {
      const { userId } = await seedWithdrawer(5);
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });
      await query(`update kyc_applications set status = 'declined' where user_id = $1`, [userId]);

      expect(await approveWithdrawal({ withdrawalId: withdrawal.id, adminId: userId })).toBe(false);
    });
  });

  describe('confirming a payment read from the chain', () => {
    async function approved(amount = 2) {
      const { userId } = await seedWithdrawer(5);
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(amount) });
      await approveWithdrawal({ withdrawalId: withdrawal.id, adminId: userId });
      return { userId, withdrawal };
    }

    it('settles escrow to the chain and records the hash', async () => {
      const { userId, withdrawal } = await approved();
      const escrowBefore = await escrowNano();
      const payment = paymentFor(withdrawal);

      const result = await confirmWithdrawalPayment(payment);

      expect(result).toMatchObject({ outcome: 'confirmed', withdrawalId: withdrawal.id, userId });
      expect(await statusOf(withdrawal.id)).toEqual({ status: 'confirmed', tx_hash: payment.txHash });
      expect(escrowBefore - (await escrowNano())).toBe(gram(2));
      expect(await getBalanceNano(userId)).toBe('3000000000');
    });

    it('also settles a request the operator had marked sent', async () => {
      const { withdrawal } = await approved();
      await markWithdrawalSent(withdrawal.id);

      expect((await confirmWithdrawalPayment(paymentFor(withdrawal))).outcome).toBe('confirmed');
    });

    // Re-reading a window of chain history is the normal path after a restart.
    it('treats the same transaction seen again as a replay', async () => {
      const { withdrawal } = await approved();
      const payment = paymentFor(withdrawal);
      await confirmWithdrawalPayment(payment);
      const escrowAfterFirst = await escrowNano();

      expect((await confirmWithdrawalPayment(payment)).outcome).toBe('replayed');
      expect(await escrowNano()).toBe(escrowAfterFirst);
    });

    it('refuses a second, different transaction for a paid withdrawal', async () => {
      const { withdrawal } = await approved();
      await confirmWithdrawalPayment(paymentFor(withdrawal));

      const second = await confirmWithdrawalPayment(paymentFor(withdrawal));

      expect(second).toMatchObject({ outcome: 'refused', reason: expect.stringContaining('paid twice') });
    });

    it('refuses a payment to a different address', async () => {
      const { withdrawal } = await approved();

      const result = await confirmWithdrawalPayment(paymentFor(withdrawal, { destination: randomAddress() }));

      expect(result.outcome).toBe('refused');
      expect((await statusOf(withdrawal.id)).status).toBe('approved');
    });

    it('refuses a payment smaller than the request', async () => {
      const { withdrawal } = await approved();

      const result = await confirmWithdrawalPayment(paymentFor(withdrawal, { amountNano: gram(2) - 1n }));

      expect(result.outcome).toBe('refused');
      expect((await statusOf(withdrawal.id)).status).toBe('approved');
    });

    // The user can still cancel a request nobody approved, so a payment that
    // skipped the approval must not settle it.
    it('refuses a payment for a request that was never approved', async () => {
      const { userId } = await seedWithdrawer(5);
      const withdrawal = await requestWithdrawal({ userId, amountNano: gram(2) });

      const result = await confirmWithdrawalPayment(paymentFor(withdrawal));

      expect(result).toMatchObject({ outcome: 'refused', reason: 'paid while requested' });
    });

    it('refuses a payment for a request that was already rejected', async () => {
      const { userId, withdrawal } = await approved();
      await rejectWithdrawal({ withdrawalId: withdrawal.id, adminId: userId, reason: null });

      const result = await confirmWithdrawalPayment(paymentFor(withdrawal));

      expect(result).toMatchObject({ outcome: 'refused', reason: 'paid while rejected' });
      expect(await getBalanceNano(userId)).toBe('5000000000');
    });

    it('ignores a memo that belongs to no withdrawal', async () => {
      const result = await confirmWithdrawalPayment({
        memo: `NOPE${randomToken(4)}`,
        txHash: `out_${randomToken(8)}`,
        destination: randomAddress(),
        amountNano: gram(1),
      });
      expect(result.outcome).toBe('unknown_memo');
    });
  });

  it('keeps every cached balance equal to its entries through a full lifecycle', async () => {
    const { userId } = await seedWithdrawer(5);
    const cancelled = await requestWithdrawal({ userId, amountNano: gram(1) });
    await cancelWithdrawal({ userId, withdrawalId: cancelled.id });
    const paid = await requestWithdrawal({ userId, amountNano: gram(2) });
    await approveWithdrawal({ withdrawalId: paid.id, adminId: userId });
    await confirmWithdrawalPayment(paymentFor(paid));

    expect(await findBalanceDrift()).toEqual([]);
  });
});

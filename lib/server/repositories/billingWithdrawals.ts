import { query, withTransaction } from "../db";
import {
  holdForWithdrawal,
  releaseWithdrawalHold,
  settleWithdrawal,
  userAccountId,
} from "./billing";
import { generateMemo } from "./tonDonations";

// Every payout costs the operator a network fee and a minute of their time,
// so an amount smaller than this is not worth asking a person to send.
export const MIN_WITHDRAWAL_NANO = 100_000_000n;

export type WithdrawalStatus =
  | "requested"
  | "approved"
  | "sent"
  | "confirmed"
  | "rejected"
  | "cancelled";

export const OPEN_WITHDRAWAL_STATUSES: WithdrawalStatus[] = ["requested", "approved", "sent"];

export type Withdrawal = {
  id: number;
  amountNano: string;
  destination: string;
  memo: string;
  status: WithdrawalStatus;
  txHash: string | null;
  rejectReason: string | null;
  createdAt: Date;
};

export type WithdrawalRefusal =
  | "identity_not_verified"
  | "no_wallet"
  | "below_minimum"
  | "already_open";

export class WithdrawalRefused extends Error {
  constructor(readonly reason: WithdrawalRefusal) {
    super(`withdrawal refused: ${reason}`);
    this.name = "WithdrawalRefused";
  }
}

type WithdrawalRow = {
  id: string;
  amount_nano: string;
  destination: string;
  memo: string;
  status: WithdrawalStatus;
  tx_hash: string | null;
  reject_reason: string | null;
  created_at: Date;
};

const withdrawalSelect = `id, amount_nano, destination, memo, status, tx_hash, reject_reason, created_at`;

function mapWithdrawal(row: WithdrawalRow): Withdrawal {
  return {
    id: Number(row.id),
    amountNano: row.amount_nano,
    destination: row.destination,
    memo: row.memo,
    status: row.status,
    txHash: row.tx_hash,
    rejectReason: row.reject_reason,
    createdAt: row.created_at,
  };
}

const pgError = (err: unknown) => err as { code?: string; constraint?: string };

/**
 * Opens a withdrawal and takes the amount out of the spendable balance in the
 * same transaction, so a request can never exist for money that is still free
 * to be charged by an app.
 *
 * The destination is never an input. It is whatever wallet the user proved
 * they control, read here, so there is no field for an attacker with a stolen
 * session to type their own address into.
 *
 * Throws WithdrawalRefused for a gate that is not met, and InsufficientBalance
 * from the ledger if the amount is more than the account holds.
 */
export async function requestWithdrawal(input: {
  userId: number;
  amountNano: bigint;
}): Promise<Withdrawal> {
  if (input.amountNano < MIN_WITHDRAWAL_NANO) throw new WithdrawalRefused("below_minimum");

  return withTransaction(async client => {
    const gate = await client.query<{ kyc_status: string | null; address: string | null }>(
      `select k.status as kyc_status, w.address
         from users u
         left join kyc_applications k on k.user_id = u.id
         left join user_ton_wallets w on w.user_id = u.id
        where u.id = $1`,
      [input.userId],
    );
    if (gate.rows[0]?.kyc_status !== "approved") throw new WithdrawalRefused("identity_not_verified");
    const destination = gate.rows[0].address;
    if (!destination) throw new WithdrawalRefused("no_wallet");

    const accountId = await userAccountId(client, input.userId);

    let row: WithdrawalRow;
    try {
      const inserted = await client.query<WithdrawalRow>(
        `insert into billing_withdrawals (account_id, user_id, amount_nano, destination, memo)
              values ($1, $2, $3::numeric, $4, $5)
           returning ${withdrawalSelect}`,
        [accountId, input.userId, input.amountNano.toString(), destination, generateMemo()],
      );
      row = inserted.rows[0];
    } catch (err) {
      if (pgError(err).constraint === "billing_withdrawals_open_idx") {
        throw new WithdrawalRefused("already_open");
      }
      throw err;
    }

    await holdForWithdrawal(client, {
      accountId,
      amountNano: input.amountNano,
      withdrawalId: Number(row.id),
    });
    return mapWithdrawal(row);
  });
}

export type ClosedWithdrawal = { userId: number | null; amountNano: string };

// Closes a withdrawal that will not be paid and returns the hold. The status
// filter is the guard: a row the caller may not close simply does not match,
// and null comes back.
async function closeUnpaid(input: {
  where: string;
  params: unknown[];
  status: "rejected" | "cancelled";
  decidedBy: number | null;
  reason: string | null;
}): Promise<ClosedWithdrawal | null> {
  return withTransaction(async client => {
    const { rows } = await client.query<{
      id: string;
      account_id: string;
      user_id: string | null;
      amount_nano: string;
    }>(
      `select id, account_id, user_id, amount_nano
         from billing_withdrawals where ${input.where} for update`,
      input.params,
    );
    const row = rows[0];
    if (!row) return null;

    await client.query(
      `update billing_withdrawals
          set status = $2, decided_by = $3, reject_reason = $4, closed_at = now(), updated_at = now()
        where id = $1`,
      [row.id, input.status, input.decidedBy, input.reason],
    );
    await releaseWithdrawalHold(client, {
      accountId: Number(row.account_id),
      amountNano: BigInt(row.amount_nano),
      withdrawalId: Number(row.id),
    });
    return {
      userId: row.user_id === null ? null : Number(row.user_id),
      amountNano: row.amount_nano,
    };
  });
}

// Only while nobody has acted on it. Once approved the operator may be paying
// it at this moment, and a cancel that raced a payment would hand the user
// both the GRAM and the balance.
export async function cancelWithdrawal(input: { userId: number; withdrawalId: number }): Promise<boolean> {
  const closed = await closeUnpaid({
    where: `id = $1 and user_id = $2 and status = 'requested'`,
    params: [input.withdrawalId, input.userId],
    status: "cancelled",
    decidedBy: null,
    reason: null,
  });
  return closed !== null;
}

// Not from 'sent': the operator has said the GRAM is on its way, so from there
// only the chain closes the request. Returning the balance as well would pay
// it twice. Resolves to whose request it was, so the caller can tell them, or
// null when there was nothing it could reject.
export async function rejectWithdrawal(input: {
  withdrawalId: number;
  adminId: number;
  reason: string | null;
}): Promise<ClosedWithdrawal | null> {
  return closeUnpaid({
    where: `id = $1 and status in ('requested', 'approved')`,
    params: [input.withdrawalId],
    status: "rejected",
    decidedBy: input.adminId,
    reason: input.reason,
  });
}

/**
 * Re-checks the gate rather than trusting that it held at request time. An
 * identity can be declined later, and a wallet can be unlinked or proved by
 * another account, and either one means the address on the request is no
 * longer a verified destination for this person.
 */
export async function approveWithdrawal(input: { withdrawalId: number; adminId: number }): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update billing_withdrawals w
        set status = 'approved', decided_by = $2, approved_at = now(), updated_at = now()
      where w.id = $1
        and w.status = 'requested'
        and exists (select 1 from kyc_applications k
                     where k.user_id = w.user_id and k.status = 'approved')
        and exists (select 1 from user_ton_wallets t
                     where t.user_id = w.user_id and t.address = w.destination)
  returning w.id`,
    [input.withdrawalId, input.adminId],
  );
  return rows.length > 0;
}

// The operator saying the payment has been broadcast. It tells the user what
// is happening and changes nothing in the ledger: the hold stays in escrow
// until the watcher has read the transaction off the chain.
export async function markWithdrawalSent(withdrawalId: number): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update billing_withdrawals set status = 'sent', sent_at = now(), updated_at = now()
      where id = $1 and status = 'approved' returning id`,
    [withdrawalId],
  );
  return rows.length > 0;
}

export type PaymentOutcome =
  | { outcome: "confirmed"; withdrawalId: number; userId: number | null; amountNano: string }
  | { outcome: "replayed" }
  | { outcome: "unknown_memo" }
  | { outcome: "refused"; withdrawalId: number; reason: string };

/**
 * Settles a withdrawal against an outbound payment the watcher read from the
 * chain. This is the only way a request becomes confirmed.
 *
 * A payment that does not match is refused rather than fitted: the wrong
 * address, a short amount, a request that was never approved or is already
 * closed. Each of those is the operator's wallet having done something the
 * queue did not ask for, and a person has to look at it.
 */
export async function confirmWithdrawalPayment(input: {
  memo: string;
  txHash: string;
  destination: string;
  amountNano: bigint;
}): Promise<PaymentOutcome> {
  return withTransaction(async client => {
    const { rows } = await client.query<{
      id: string;
      user_id: string | null;
      amount_nano: string;
      destination: string;
      status: WithdrawalStatus;
      tx_hash: string | null;
    }>(
      `select id, user_id, amount_nano, destination, status, tx_hash
         from billing_withdrawals where memo = $1 for update`,
      [input.memo],
    );
    const row = rows[0];
    if (!row) return { outcome: "unknown_memo" };

    const withdrawalId = Number(row.id);
    const refused = (reason: string): PaymentOutcome => ({ outcome: "refused", withdrawalId, reason });

    // Re-reading a window of chain history is the normal path after a restart.
    if (row.status === "confirmed" && row.tx_hash === input.txHash) return { outcome: "replayed" };
    if (row.status === "confirmed") return refused(`already confirmed by ${row.tx_hash}, paid twice`);
    if (row.status !== "approved" && row.status !== "sent") {
      return refused(`paid while ${row.status}`);
    }
    if (input.destination !== row.destination) return refused(`paid to ${input.destination}`);
    if (input.amountNano < BigInt(row.amount_nano)) {
      return refused(`paid ${input.amountNano} of ${row.amount_nano}`);
    }

    await client.query(
      `update billing_withdrawals
          set status = 'confirmed', tx_hash = $2, closed_at = now(), updated_at = now()
        where id = $1`,
      [row.id, input.txHash],
    );
    await settleWithdrawal(client, { amountNano: BigInt(row.amount_nano), withdrawalId });

    return {
      outcome: "confirmed",
      withdrawalId,
      userId: row.user_id === null ? null : Number(row.user_id),
      amountNano: row.amount_nano,
    };
  });
}

export async function listWithdrawalsForUser(userId: number, limit = 10): Promise<Withdrawal[]> {
  const rows = await query<WithdrawalRow>(
    `select ${withdrawalSelect} from billing_withdrawals
      where user_id = $1 order by id desc limit $2`,
    [userId, limit],
  );
  return rows.map(mapWithdrawal);
}

export type QueuedWithdrawal = Withdrawal & {
  username: string | null;
  identityApproved: boolean;
  walletStillLinked: boolean;
};

// The operator's view: open requests oldest first, because the person who has
// waited longest is the one to pay next, then what was closed recently.
export async function listWithdrawalQueue(): Promise<QueuedWithdrawal[]> {
  const rows = await query<
    WithdrawalRow & { username: string | null; identity_approved: boolean; wallet_still_linked: boolean }
  >(
    `select w.id, w.amount_nano, w.destination, w.memo, w.status, w.tx_hash, w.reject_reason,
            w.created_at, u.username,
            coalesce(k.status = 'approved', false) as identity_approved,
            coalesce(t.address = w.destination, false) as wallet_still_linked
       from billing_withdrawals w
       left join users u on u.id = w.user_id
       left join kyc_applications k on k.user_id = w.user_id
       left join user_ton_wallets t on t.user_id = w.user_id
      order by (w.closed_at is null) desc,
               case when w.closed_at is null then w.id end asc,
               w.closed_at desc
      limit 200`,
  );
  return rows.map(row => ({
    ...mapWithdrawal(row),
    username: row.username,
    identityApproved: row.identity_approved,
    walletStillLinked: row.wallet_still_linked,
  }));
}

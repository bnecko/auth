import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../db";

// Amounts cross this module as decimal strings and are reasoned about as
// BigInt. A nanocoin total passes 2^53 at nine coins, so a JS number would
// start dropping the low digits of real balances.
export const NANO_PER_GRAM = 1_000_000_000n;

export type TransferKind =
  | "deposit"
  | "charge"
  | "refund"
  | "withdrawal"
  | "forfeit"
  | "pool_donation"
  | "adjustment";

export class InsufficientBalance extends Error {
  constructor() {
    super("insufficient balance");
    this.name = "InsufficientBalance";
  }
}

const pgCode = (err: unknown) =>
  err instanceof Error ? (err as Error & { code?: string }).code : undefined;

async function singletonAccountId(client: PoolClient, kind: "pool" | "chain"): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `select id from billing_accounts where kind = $1`,
    [kind],
  );
  if (!rows[0]) throw new Error(`billing ${kind} account is missing`);
  return Number(rows[0].id);
}

// Created on first use rather than at sign-up, because most accounts never
// touch billing. Concurrent first uses are arbitrated by the unique index.
async function userAccountId(client: PoolClient, userId: number): Promise<number> {
  const created = await client.query<{ id: string }>(
    `insert into billing_accounts (kind, user_id) values ('user', $1)
     on conflict do nothing returning id`,
    [userId],
  );
  if (created.rows[0]) {
    await client.query(
      `insert into billing_balances (account_id) values ($1) on conflict do nothing`,
      [created.rows[0].id],
    );
    return Number(created.rows[0].id);
  }

  const existing = await client.query<{ id: string }>(
    `select id from billing_accounts where user_id = $1`,
    [userId],
  );
  if (!existing.rows[0]) throw new Error(`could not open a billing account for user ${userId}`);
  return Number(existing.rows[0].id);
}

/**
 * Posts one movement: a transfer and its two legs, which sum to zero.
 *
 * Returns posted:false when the reference has already been used for this kind.
 * That is the normal path for a replayed chain ingestion or a retried charge,
 * not an error.
 *
 * Balance rows are locked in ascending account order. Two transfers touching
 * the same pair in opposite directions would otherwise each hold what the
 * other is waiting for.
 *
 * The chain account has no balance row, so the update against it matches
 * nothing. That is deliberate: it stands for everything outside this service,
 * its balance is negative by design, and it is the one account with no floor.
 */
async function postTransfer(
  client: PoolClient,
  input: {
    fromAccountId: number;
    toAccountId: number;
    amountNano: bigint;
    kind: TransferKind;
    reference: string | null;
    appId?: number | null;
  },
): Promise<{ posted: boolean }> {
  if (input.amountNano <= 0n) throw new Error("transfer amount must be positive");
  if (input.fromAccountId === input.toAccountId) throw new Error("transfer to the same account");

  for (const accountId of [input.fromAccountId, input.toAccountId].sort((a, b) => a - b)) {
    await client.query(`select 1 from billing_balances where account_id = $1 for update`, [accountId]);
  }

  let transferId: string;
  try {
    const { rows } = await client.query<{ id: string }>(
      `insert into billing_transfers (kind, reference, app_id) values ($1, $2, $3) returning id`,
      [input.kind, input.reference, input.appId ?? null],
    );
    transferId = rows[0].id;
  } catch (err) {
    if (pgCode(err) === "23505") return { posted: false };
    throw err;
  }

  const amount = input.amountNano.toString();
  await client.query(
    `insert into billing_entries (transfer_id, account_id, amount_nano)
          values ($1, $2, ($3::numeric) * -1), ($1, $4, $3::numeric)`,
    [transferId, input.fromAccountId, amount, input.toAccountId],
  );

  try {
    await client.query(
      `update billing_balances set balance_nano = balance_nano - $2::numeric, updated_at = now()
        where account_id = $1`,
      [input.fromAccountId, amount],
    );
    await client.query(
      `update billing_balances set balance_nano = balance_nano + $2::numeric, updated_at = now()
        where account_id = $1`,
      [input.toAccountId, amount],
    );
  } catch (err) {
    // The non-negative check is what makes an overdraft impossible rather than
    // merely unlikely; it firing is a spend that was too large, not a bug.
    if (pgCode(err) === "23514") throw new InsufficientBalance();
    throw err;
  }

  return { posted: true };
}

// A payment that arrived on chain, credited to the depositor. The transaction
// hash is the idempotency key, so re-reading a window credits nothing twice.
export async function creditDeposit(input: {
  userId: number;
  amountNano: bigint;
  txHash: string;
}): Promise<{ posted: boolean }> {
  return withTransaction(async client => {
    const chain = await singletonAccountId(client, "chain");
    const user = await userAccountId(client, input.userId);
    return postTransfer(client, {
      fromAccountId: chain,
      toAccountId: user,
      amountNano: input.amountNano,
      kind: "deposit",
      reference: input.txHash,
    });
  });
}

// An app charging a user moves btGRAM to whoever owns the app, so the owner is
// the one who can later withdraw it. An app with no owner cannot be charged
// for: the money would have nowhere to land.
export async function chargeUser(input: {
  userId: number;
  appId: number;
  amountNano: bigint;
  idempotencyKey: string;
}): Promise<{ posted: boolean }> {
  return withTransaction(async client => {
    const { rows } = await client.query<{ owner_user_id: string | null }>(
      `select owner_user_id from external_apps where id = $1`,
      [input.appId],
    );
    const ownerId = rows[0]?.owner_user_id;
    if (!ownerId) throw new Error(`app ${input.appId} has no owner to credit`);
    if (Number(ownerId) === input.userId) throw new Error("an app cannot charge its own owner");

    const payer = await userAccountId(client, input.userId);
    const owner = await userAccountId(client, Number(ownerId));
    return postTransfer(client, {
      fromAccountId: payer,
      toAccountId: owner,
      amountNano: input.amountNano,
      kind: "charge",
      reference: input.idempotencyKey,
      appId: input.appId,
    });
  });
}

export async function donateToPool(input: {
  userId: number;
  amountNano: bigint;
  reference: string;
}): Promise<{ posted: boolean }> {
  return withTransaction(async client => {
    const user = await userAccountId(client, input.userId);
    const pool = await singletonAccountId(client, "pool");
    return postTransfer(client, {
      fromAccountId: user,
      toAccountId: pool,
      amountNano: input.amountNano,
      kind: "pool_donation",
      reference: input.reference,
    });
  });
}

/**
 * Sweeps whatever a departing account still holds into the public pool, and is
 * what lets the user row be deleted afterwards without money going missing.
 *
 * Call it inside the purge, before the user is removed. A zero balance posts
 * nothing. The user's entries stay behind with their account row, whose
 * user_id becomes null: the history of where the money went outlives the
 * person it belonged to.
 */
export async function forfeitToPool(userId: number): Promise<{ movedNano: string }> {
  return withTransaction(async client => {
    const { rows } = await client.query<{ id: string; balance_nano: string }>(
      `select a.id, b.balance_nano
         from billing_accounts a
         join billing_balances b on b.account_id = a.id
        where a.user_id = $1
          for update of b`,
      [userId],
    );
    const account = rows[0];
    if (!account) return { movedNano: "0" };

    const balance = BigInt(account.balance_nano);
    if (balance <= 0n) return { movedNano: "0" };

    const pool = await singletonAccountId(client, "pool");
    await postTransfer(client, {
      fromAccountId: Number(account.id),
      toAccountId: pool,
      amountNano: balance,
      kind: "forfeit",
      reference: `user:${userId}`,
    });
    return { movedNano: balance.toString() };
  });
}

export async function getBalanceNano(userId: number): Promise<string> {
  const row = await queryOne<{ balance_nano: string }>(
    `select b.balance_nano
       from billing_balances b
       join billing_accounts a on a.id = b.account_id
      where a.user_id = $1`,
    [userId],
  );
  return row?.balance_nano ?? "0";
}

export async function getPoolBalanceNano(): Promise<string> {
  const row = await queryOne<{ balance_nano: string }>(
    `select b.balance_nano
       from billing_balances b
       join billing_accounts a on a.id = b.account_id
      where a.kind = 'pool'`,
  );
  return row?.balance_nano ?? "0";
}

// Cached balances against the sum of their legs. Both are written in the same
// transaction, so a difference is corruption rather than lag, and it is worth
// finding before a user does.
export async function findBalanceDrift(): Promise<
  { accountId: number; cached: string; summed: string }[]
> {
  const rows = await query<{ account_id: string; cached: string; summed: string }>(
    `select b.account_id,
            b.balance_nano::text as cached,
            coalesce(sum(e.amount_nano), 0)::text as summed
       from billing_balances b
       left join billing_entries e on e.account_id = b.account_id
      group by b.account_id, b.balance_nano
     having b.balance_nano <> coalesce(sum(e.amount_nano), 0)`,
  );
  return rows.map(row => ({
    accountId: Number(row.account_id),
    cached: row.cached,
    summed: row.summed,
  }));
}

export type LedgerEntry = {
  amountNano: string;
  kind: TransferKind;
  appName: string | null;
  createdAt: Date;
};

// Most recent movements on a user's account, for showing them where their
// balance came from and went. Signed: negative is money leaving.
export async function listEntriesForUser(userId: number, limit = 25): Promise<LedgerEntry[]> {
  const rows = await query<{
    amount_nano: string;
    kind: TransferKind;
    app_name: string | null;
    created_at: Date;
  }>(
    `select e.amount_nano, t.kind, a.name as app_name, e.created_at
       from billing_entries e
       join billing_transfers t on t.id = e.transfer_id
       join billing_accounts acc on acc.id = e.account_id
       left join external_apps a on a.id = t.app_id
      where acc.user_id = $1
      order by e.id desc
      limit $2`,
    [userId, limit],
  );
  return rows.map(row => ({
    amountNano: row.amount_nano,
    kind: row.kind,
    appName: row.app_name,
    createdAt: row.created_at,
  }));
}

// Nanocoins to a readable GRAM figure, integer maths throughout: a balance
// crosses 2^53 at nine coins, so dividing as a float would drift.
export function formatGram(nano: string): string {
  const value = BigInt(nano);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / NANO_PER_GRAM;
  const fraction = (abs % NANO_PER_GRAM).toString().padStart(9, "0").replace(/0+$/, "") || "0";
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

import { randomInt } from "crypto";
import { query, queryOne } from "../db";

// Unambiguous alphabet, as used for the admin step-up code: a memo gets read
// off one screen and typed into a wallet on another, so O/0 and I/1/l must not
// be in it. Ten characters is roughly 50 bits, which matters because the memo
// is the only thing tying a payment to an account and it travels in public on
// the chain: a guessable one would let someone credit their payment to
// somebody else, or grep the chain for a memo to learn whose it is.
const MEMO_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MEMO_LENGTH = 10;

export function generateMemo() {
  let memo = "";
  for (let i = 0; i < MEMO_LENGTH; i += 1) memo += MEMO_CHARS[randomInt(0, MEMO_CHARS.length)];
  return memo;
}

/**
 * The donation memo for a user, minted on first use. Stable once issued, so a
 * payment sent days after the page was open still matches.
 */
export async function getOrCreateDepositMemo(userId: number): Promise<string> {
  return memoFor(userId, "billing_deposit_memos");
}

export async function getOrCreateDonationMemo(userId: number): Promise<string> {
  return memoFor(userId, "ton_donation_memos");
}

// Both memo tables have the same shape: user_id primary key, memo unique.
async function memoFor(userId: number, table: "ton_donation_memos" | "billing_deposit_memos") {
  const existing = await queryOne<{ memo: string }>(
    `select memo from ${table} where user_id = $1`,
    [userId],
  );
  if (existing) return existing.memo;

  // Retried rather than pre-checked: uniqueness belongs to the index, and the
  // only way two callers can collide is by racing between a check and a write.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const row = await queryOne<{ memo: string }>(
        `insert into ${table} (user_id, memo) values ($1, $2)
         on conflict (user_id) do update set memo = ${table}.memo
         returning memo`,
        [userId, generateMemo()],
      );
      if (row) return row.memo;
    } catch (err) {
      if (!(err instanceof Error && (err as Error & { code?: string }).code === "23505")) throw err;
    }
  }
  throw new Error(`could not allocate a memo in ${table}`);
}

export type Donation = {
  amountNano: string;
  sender: string | null;
  txHash: string;
  txTime: Date | null;
};

type DonationRow = {
  amount_nano: string;
  sender: string | null;
  tx_hash: string;
  tx_time: Date | null;
};

// Amounts stay strings all the way out. A nanocoin total passes 2^53 at nine
// coins, so parsing one into a JS number would start losing the low digits.
export async function listDonationsForUser(userId: number): Promise<Donation[]> {
  const rows = await query<DonationRow>(
    `select amount_nano, sender, tx_hash, tx_time
       from ton_donations
      where user_id = $1 and status = 'credited'
      order by tx_time desc nulls last
      limit 100`,
    [userId],
  );
  return rows.map(row => ({
    amountNano: row.amount_nano,
    sender: row.sender,
    txHash: row.tx_hash,
    txTime: row.tx_time,
  }));
}

export async function donatedTotalNano(userId: number): Promise<string> {
  const rows = await query<{ total: string }>(
    `select coalesce(sum(amount_nano), 0)::text as total
       from ton_donations where user_id = $1 and status = 'credited'`,
    [userId],
  );
  return rows[0]?.total ?? "0";
}

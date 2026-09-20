import { query } from "../db";

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

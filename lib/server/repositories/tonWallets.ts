import { query, queryOne } from "../db";

export type TonWalletDisplay = "hidden" | "address" | "domain";

export type TonWallet = {
  userId: number;
  address: string;
  walletVersion: string;
  verifiedAt: Date;
  display: TonWalletDisplay;
  displayDomain: string | null;
  domainCheckedAt: Date | null;
};

type TonWalletRow = {
  user_id: string;
  address: string;
  wallet_version: string;
  verified_at: Date;
  display: TonWalletDisplay;
  display_domain: string | null;
  domain_checked_at: Date | null;
};

const walletSelect = `user_id, address, wallet_version, verified_at, display, display_domain, domain_checked_at`;

function mapWallet(row: TonWalletRow): TonWallet {
  return {
    userId: Number(row.user_id),
    address: row.address,
    walletVersion: row.wallet_version,
    verifiedAt: row.verified_at,
    display: row.display,
    displayDomain: row.display_domain,
    domainCheckedAt: row.domain_checked_at,
  };
}

export async function findTonWallet(userId: number): Promise<TonWallet | null> {
  const row = await queryOne<TonWalletRow>(
    `select ${walletSelect} from user_ton_wallets where user_id = $1`,
    [userId],
  );
  return row ? mapWallet(row) : null;
}

export type LinkTonWalletResult =
  | { ok: true; wallet: TonWallet; displacedUserId: number | null }
  | { ok: false; reason: "conflict" };

/**
 * Binds a proved address to a user, taking it from any other account holding
 * it. Caller must have verified a proof for this address first.
 *
 * Latest proof wins because the alternative is worse: TON Connect cannot stop
 * someone showing a victim their own connect request, so a relayed proof would
 * let an attacker claim an address first and hold it forever, with the real
 * owner unable to take it back. Letting the key holder always win means the
 * owner re-proves and recovers it. The displaced account is returned so the
 * caller can tell them it happened.
 */
export async function linkTonWallet(input: {
  userId: number;
  address: string;
  walletVersion: string;
}): Promise<LinkTonWalletResult> {
  const displaced = await query<{ user_id: string }>(
    `delete from user_ton_wallets where address = $1 and user_id <> $2 returning user_id`,
    [input.address, input.userId],
  );

  try {
    const rows = await query<TonWalletRow>(
      `insert into user_ton_wallets (user_id, address, wallet_version)
            values ($1, $2, $3)
       on conflict (user_id) do update
          set address = excluded.address,
              wallet_version = excluded.wallet_version,
              verified_at = now(),
              updated_at = now(),
              display = case when user_ton_wallets.address = excluded.address
                             then user_ton_wallets.display else 'hidden' end,
              display_domain = case when user_ton_wallets.address = excluded.address
                                    then user_ton_wallets.display_domain else null end,
              domain_checked_at = case when user_ton_wallets.address = excluded.address
                                       then user_ton_wallets.domain_checked_at else null end
       returning ${walletSelect}`,
      [input.userId, input.address, input.walletVersion],
    );
    return {
      ok: true,
      wallet: mapWallet(rows[0]),
      displacedUserId: displaced[0] ? Number(displaced[0].user_id) : null,
    };
  } catch (err) {
    // Two accounts proving the same address at the same instant: the unique
    // index picks the winner and the loser is asked to try again.
    if (err instanceof Error && (err as Error & { code?: string }).code === "23505") {
      return { ok: false, reason: "conflict" };
    }
    throw err;
  }
}

// Clearing the domain alongside the mode is what the table's check constraint
// requires, and is also correct: a name is only ever shown while it is the
// thing being shown.
export async function setTonWalletDisplay(
  userId: number,
  display: Exclude<TonWalletDisplay, "domain">,
): Promise<boolean> {
  const rows = await query<{ user_id: string }>(
    `update user_ton_wallets
        set display = $2, display_domain = null, domain_checked_at = null, updated_at = now()
      where user_id = $1
      returning user_id`,
    [userId, display],
  );
  return rows.length > 0;
}

export async function unlinkTonWallet(userId: number): Promise<boolean> {
  const rows = await query<{ user_id: string }>(
    `delete from user_ton_wallets where user_id = $1 returning user_id`,
    [userId],
  );
  return rows.length > 0;
}

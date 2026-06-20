import { query, queryOne } from "../db";
import { hashToken } from "../crypto";

// The bans table predates enforcement; these helpers make the telegram_id kind
// actually block access, so a ban survives the user deleting and recreating
// their account (the Telegram ID is the stable identity). Telegram IDs are
// stored hashed (sha256 via hashToken), never in plaintext.

export async function createTelegramIdBan(input: {
  telegramId: string;
  userId: number | null;
  reason: string | null;
  createdByUserId: number;
}) {
  await query(
    `insert into bans (kind, user_id, value_hash, reason, created_by_user_id)
     values ('telegram_id', $1, $2, $3, $4)
     on conflict (kind, value_hash)
       where revoked_at is null and value_hash is not null
       do nothing`,
    [input.userId, hashToken(input.telegramId), input.reason, input.createdByUserId],
  );
}

export async function isTelegramIdBanned(telegramId: string | null | undefined) {
  if (!telegramId) return false;
  const row = await queryOne<{ exists: boolean }>(
    `select exists(
       select 1 from bans
        where kind = 'telegram_id'
          and value_hash = $1
          and revoked_at is null
          and (expires_at is null or expires_at > now())
     )`,
    [hashToken(telegramId)],
  );
  return row?.exists === true;
}

export async function isActiveBanForUser(userId: number) {
  const row = await queryOne<{ exists: boolean }>(
    `select exists(
       select 1 from bans
        where user_id = $1
          and revoked_at is null
          and (expires_at is null or expires_at > now())
     )`,
    [userId],
  );
  return row?.exists === true;
}

// Lift the bans created when an account was banned (called on unban).
export async function revokeBansForUser(userId: number) {
  await query(
    `update bans set revoked_at = now()
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
}

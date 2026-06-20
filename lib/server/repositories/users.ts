import { query, queryOne } from "../db";
import { normalizeIdentifier } from "../crypto";
import type { TelegramIdentity, User, UserRole, UserStatus } from "../types";

type UserRow = {
  id: string;
  public_id: string;
  first_name: string;
  username: string;
  bio: string | null;
  email: string;
  email_verified_at: string | null;
  dob: string | null;
  telegram_id: string | null;
  telegram_username: string | null;
  telegram_verified_at: string | null;
  avatar_preset: number | null;
  restricted: boolean;
  restricted_at: string | null;
  deactivated_at: string | null;
  deletion_requested_at: string | null;
  notify_security_receipts: boolean;
  notify_signin_alerts: boolean;
  profile_public: boolean;
  discoverable_by_username: boolean;
  public_show_telegram: boolean;
  role: UserRole;
  status: UserStatus;
  created_at: string;
};

export type CreateUserInput = {
  publicId: string;
  firstName: string;
  username: string;
  bio: string | null;
  email: string;
  dob: string | null;
  passwordHash: string;
  telegram?: TelegramIdentity | null;
};

function mapUser(row: UserRow): User {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    firstName: row.first_name,
    username: row.username,
    bio: row.bio,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    dob: row.dob,
    telegramId: row.telegram_id,
    telegramUsername: row.telegram_username,
    telegramVerifiedAt: row.telegram_verified_at,
    avatarPreset: row.avatar_preset,
    restricted: row.restricted,
    restrictedAt: row.restricted_at,
    deactivatedAt: row.deactivated_at,
    deletionRequestedAt: row.deletion_requested_at,
    notifySecurityReceipts: row.notify_security_receipts,
    notifySigninAlerts: row.notify_signin_alerts,
    profilePublic: row.profile_public,
    discoverableByUsername: row.discoverable_by_username,
    publicShowTelegram: row.public_show_telegram,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

const userSelect = `
  id,
  public_id,
  first_name,
  username,
  bio,
  email,
  email_verified_at::text,
  dob::text,
  telegram_id,
  telegram_username,
  telegram_verified_at::text,
  avatar_preset,
  restricted,
  restricted_at::text,
  deactivated_at::text,
  deletion_requested_at::text,
  notify_security_receipts,
  notify_signin_alerts,
  profile_public,
  discoverable_by_username,
  public_show_telegram,
  role,
  status,
  created_at::text
`;

export async function findUserById(id: number) {
  const row = await queryOne<UserRow>(
    `select ${userSelect} from users where id = $1`,
    [id],
  );
  return row ? mapUser(row) : null;
}

export async function findUserByPublicId(publicId: string) {
  const row = await queryOne<UserRow>(
    `select ${userSelect} from users where public_id = $1`,
    [publicId],
  );
  return row ? mapUser(row) : null;
}

// Ungated profile fields (no Telegram/uniqueness gate). Only the provided
// fields are updated.
export async function updateUserProfile(
  userId: number,
  input: { firstName?: string; bio?: string | null; avatarPreset?: number | null },
) {
  const row = await queryOne<UserRow>(
    `update users
        set first_name = coalesce($2, first_name),
            bio = case when $3::boolean then $4 else bio end,
            avatar_preset = case when $5::boolean then $6 else avatar_preset end,
            updated_at = now()
      where id = $1
      returning ${userSelect}`,
    [
      userId,
      input.firstName ?? null,
      input.bio !== undefined,
      input.bio ?? null,
      input.avatarPreset !== undefined,
      input.avatarPreset ?? null,
    ],
  );
  return row ? mapUser(row) : null;
}

// Notification preferences. Each flag gates a real Telegram send in notifyUser().
export async function updateNotificationPrefs(
  userId: number,
  input: { notifySecurityReceipts: boolean; notifySigninAlerts: boolean },
) {
  const row = await queryOne<UserRow>(
    `update users
        set notify_security_receipts = $2,
            notify_signin_alerts = $3,
            updated_at = now()
      where id = $1
      returning ${userSelect}`,
    [userId, input.notifySecurityReceipts, input.notifySigninAlerts],
  );
  return row ? mapUser(row) : null;
}

// Privacy controls. Each flag gates the public profile at /u/[id] or the
// /user/[username] alias.
export async function updatePrivacySettings(
  userId: number,
  input: {
    profilePublic: boolean;
    discoverableByUsername: boolean;
    publicShowTelegram: boolean;
  },
) {
  const row = await queryOne<UserRow>(
    `update users
        set profile_public = $2,
            discoverable_by_username = $3,
            public_show_telegram = $4,
            updated_at = now()
      where id = $1
      returning ${userSelect}`,
    [
      userId,
      input.profilePublic,
      input.discoverableByUsername,
      input.publicShowTelegram,
    ],
  );
  return row ? mapUser(row) : null;
}

// Reversible self-service pause. Idempotent: a no-op if already deactivated.
export async function deactivateAccount(userId: number) {
  const row = await queryOne<UserRow>(
    `update users
        set deactivated_at = now(), updated_at = now()
      where id = $1 and deactivated_at is null
      returning ${userSelect}`,
    [userId],
  );
  return row ? mapUser(row) : null;
}

// Schedule a grace-period soft delete. Idempotent: a no-op if already pending.
export async function scheduleAccountDeletion(userId: number) {
  const row = await queryOne<UserRow>(
    `update users
        set deletion_requested_at = now(), updated_at = now()
      where id = $1 and deletion_requested_at is null
      returning ${userSelect}`,
    [userId],
  );
  return row ? mapUser(row) : null;
}

// Clear any dormant state on a successful sign-in: reactivates a deactivated
// account and cancels a pending deletion. Returns which flags were cleared
// (read from the pre-update snapshot) so the caller can audit the reason.
export async function clearAccountDormancy(userId: number) {
  const row = await queryOne<{ was_deactivated: boolean; was_pending_deletion: boolean }>(
    `with prev as (
       select deactivated_at, deletion_requested_at from users where id = $1
     )
     update users u
        set deactivated_at = null, deletion_requested_at = null, updated_at = now()
       from prev
      where u.id = $1
        and (prev.deactivated_at is not null or prev.deletion_requested_at is not null)
      returning
        (prev.deactivated_at is not null) as was_deactivated,
        (prev.deletion_requested_at is not null) as was_pending_deletion`,
    [userId],
  );
  return row
    ? { wasDeactivated: row.was_deactivated, wasPendingDeletion: row.was_pending_deletion }
    : null;
}

// Apply a username change, re-checking uniqueness atomically (23505 -> null so
// the caller can report a conflict). new value is already validated.
export async function applyUsernameChange(userId: number, username: string) {
  try {
    const row = await queryOne<UserRow>(
      `update users
          set username = $2, username_normalized = $3, updated_at = now()
        where id = $1
        returning ${userSelect}`,
      [userId, username, normalizeIdentifier(username)],
    );
    return row ? mapUser(row) : null;
  } catch (err) {
    if (err instanceof Error && (err as Error & { code?: string }).code === "23505") {
      return null;
    }
    throw err;
  }
}

// Apply an email change. The new email is treated as unverified (there is no
// email-verification flow yet), so email_verified_at is cleared.
export async function applyEmailChange(userId: number, email: string) {
  try {
    const row = await queryOne<UserRow>(
      `update users
          set email = $2, email_normalized = $3, email_verified_at = null, updated_at = now()
        where id = $1
        returning ${userSelect}`,
      [userId, email, normalizeIdentifier(email)],
    );
    return row ? mapUser(row) : null;
  } catch (err) {
    if (err instanceof Error && (err as Error & { code?: string }).code === "23505") {
      return null;
    }
    throw err;
  }
}

export async function findUserByIdentifier(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  const row = await queryOne<UserRow>(
    `select ${userSelect}
       from users
      where email_normalized = $1 or username_normalized = $1`,
    [normalized],
  );
  return row ? mapUser(row) : null;
}

export async function findUserByTelegramId(telegramId: string) {
  const row = await queryOne<UserRow>(
    `select ${userSelect} from users where telegram_id = $1`,
    [telegramId],
  );
  return row ? mapUser(row) : null;
}

export async function usernameOrEmailExists(username: string, email: string) {
  const row = await queryOne<{ exists: boolean }>(
    `select exists(
       select 1
         from users
        where username_normalized = $1 or email_normalized = $2
     )`,
    [normalizeIdentifier(username), normalizeIdentifier(email)],
  );
  return row?.exists === true;
}

export async function usernameExists(username: string) {
  const row = await queryOne<{ exists: boolean }>(
    `select exists(select 1 from users where username_normalized = $1)`,
    [normalizeIdentifier(username)],
  );
  return row?.exists === true;
}

export async function emailExists(email: string) {
  const row = await queryOne<{ exists: boolean }>(
    `select exists(select 1 from users where email_normalized = $1)`,
    [normalizeIdentifier(email)],
  );
  return row?.exists === true;
}

export async function createUser(input: CreateUserInput) {
  const row = await queryOne<UserRow>(
    `insert into users (
       public_id,
       first_name,
       username,
       username_normalized,
       bio,
       email,
       email_normalized,
       dob,
       password_hash,
       telegram_id,
       telegram_username,
       telegram_verified_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12)
     returning ${userSelect}`,
    [
      input.publicId,
      input.firstName,
      input.username,
      normalizeIdentifier(input.username),
      input.bio,
      input.email,
      normalizeIdentifier(input.email),
      input.dob,
      input.passwordHash,
      input.telegram?.id || null,
      input.telegram?.username || null,
      input.telegram ? new Date().toISOString() : null,
    ],
  );

  if (!row) {
    throw new Error("failed to create user");
  }

  return mapUser(row);
}

export async function linkTelegram(userId: number, telegram: TelegramIdentity) {
  // Refuse to overwrite an existing telegram link - preventing a CSRF on
  // GET /api/telegram/callback from rebinding a logged-in user's account to
  // an attacker-controlled Telegram identity. The unique constraint on
  // users.telegram_id additionally prevents the same TG id being attached
  // to a second user; we surface that as a domain error rather than letting
  // the raw DB error escape.
  try {
    const row = await queryOne<UserRow>(
      `update users
          set telegram_id = $2,
              telegram_username = $3,
              telegram_verified_at = now(),
              updated_at = now()
        where id = $1
          and telegram_id is null
        returning ${userSelect}`,
      [userId, telegram.id, telegram.username],
    );
    return row ? mapUser(row) : null;
  } catch (err) {
    if (
      err instanceof Error &&
      (err as Error & { code?: string }).code === "23505"
    ) {
      return null;
    }
    throw err;
  }
}

// Unconditional relink - clears any existing Telegram association and sets the
// new one. Only called after the user has proven ownership of their current
// linked account via an OTP delivered to that account.
export async function relinkTelegram(userId: number, telegram: TelegramIdentity) {
  try {
    const row = await queryOne<UserRow>(
      `update users
          set telegram_id = $2,
              telegram_username = $3,
              telegram_verified_at = now(),
              updated_at = now()
        where id = $1
        returning ${userSelect}`,
      [userId, telegram.id, telegram.username],
    );
    return row ? mapUser(row) : null;
  } catch (err) {
    if (
      err instanceof Error &&
      (err as Error & { code?: string }).code === "23505"
    ) {
      // The Telegram account is already linked to a different user.
      return null;
    }
    throw err;
  }
}

export async function setUserStatus(
  userId: number,
  status: UserStatus,
) {
  await query(
    `update users set status = $2, updated_at = now() where id = $1`,
    [userId, status],
  );
}

export async function findPasswordHash(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  return queryOne<{ id: string; password_hash: string; status: UserStatus }>(
    `select id, password_hash, status
       from users
      where email_normalized = $1 or username_normalized = $1`,
    [normalized],
  );
}

export async function findPasswordHashById(userId: number) {
  return queryOne<{ id: string; password_hash: string; status: UserStatus }>(
    `select id, password_hash, status from users where id = $1`,
    [userId],
  );
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  await query(
    `update users set password_hash = $2, updated_at = now() where id = $1`,
    [userId, passwordHash],
  );
}

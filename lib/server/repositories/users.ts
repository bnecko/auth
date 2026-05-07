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
  dob: string | null;
  telegram_id: string | null;
  telegram_username: string | null;
  telegram_verified_at: string | null;
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
    dob: row.dob,
    telegramId: row.telegram_id,
    telegramUsername: row.telegram_username,
    telegramVerifiedAt: row.telegram_verified_at,
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
  dob::text,
  telegram_id,
  telegram_username,
  telegram_verified_at::text,
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
  // Refuse to overwrite an existing telegram link — preventing a CSRF on
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

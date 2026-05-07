import { query, queryOne } from "../db";
import { normalizeIdentifier } from "../crypto";
import type { TelegramIdentity } from "../types";

export type RegistrationRequest = {
  id: number;
  publicId: string;
  firstName: string;
  username: string;
  bio: string | null;
  email: string;
  dob: string | null;
  passwordHash: string;
  status: "pending" | "verified" | "completed" | "expired" | "cancelled";
  telegramId: string | null;
  telegramUsername: string | null;
  userId: number | null;
  expiresAt: string;
};

type RegistrationRequestRow = {
  id: string;
  public_id: string;
  first_name: string;
  username: string;
  bio: string | null;
  email: string;
  dob: string | null;
  password_hash: string;
  status: RegistrationRequest["status"];
  telegram_id: string | null;
  telegram_username: string | null;
  user_id: string | null;
  expires_at: string;
};

function mapRegistrationRequest(row: RegistrationRequestRow): RegistrationRequest {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    firstName: row.first_name,
    username: row.username,
    bio: row.bio,
    email: row.email,
    dob: row.dob,
    passwordHash: row.password_hash,
    status: row.status,
    telegramId: row.telegram_id,
    telegramUsername: row.telegram_username,
    userId: row.user_id ? Number(row.user_id) : null,
    expiresAt: row.expires_at,
  };
}

const registrationSelect = `
  id,
  public_id,
  first_name,
  username,
  bio,
  email,
  dob::text,
  password_hash,
  status,
  telegram_id,
  telegram_username,
  user_id,
  expires_at::text
`;

export async function createRegistrationRequest(input: {
  publicId: string;
  firstName: string;
  username: string;
  bio: string | null;
  email: string;
  dob: string | null;
  passwordHash: string;
  startTokenHash: string;
  ip: string;
  userAgent: string;
  expiresAt: Date;
}) {
  const row = await queryOne<RegistrationRequestRow>(
    `insert into registration_requests (
       public_id,
       first_name,
       username,
       username_normalized,
       bio,
       email,
       email_normalized,
       dob,
       password_hash,
       verification_code_hash,
       ip,
       user_agent,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12, $13)
     returning ${registrationSelect}`,
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
      input.startTokenHash,
      input.ip,
      input.userAgent,
      input.expiresAt.toISOString(),
    ],
  );

  if (!row) {
    throw new Error("failed to create registration request");
  }

  return mapRegistrationRequest(row);
}

export async function findRegistrationRequest(publicId: string) {
  const row = await queryOne<RegistrationRequestRow>(
    `select ${registrationSelect}
       from registration_requests
      where public_id = $1`,
    [publicId],
  );
  return row ? mapRegistrationRequest(row) : null;
}

export async function verifyRegistrationRequest(
  startTokenHash: string,
  telegram: TelegramIdentity,
) {
  const row = await queryOne<RegistrationRequestRow>(
    `update registration_requests
        set status = 'verified',
            telegram_id = $2,
            telegram_username = $3,
            verified_at = now()
      where verification_code_hash = $1
        and status = 'pending'
        and expires_at > now()
      returning ${registrationSelect}`,
    [startTokenHash, telegram.id, telegram.username],
  );
  return row ? mapRegistrationRequest(row) : null;
}

export async function completeRegistrationRequest(
  publicId: string,
  userId: number,
) {
  await query(
    `update registration_requests
        set status = 'completed',
            user_id = $2,
            completed_at = now()
      where public_id = $1`,
    [publicId, userId],
  );
}

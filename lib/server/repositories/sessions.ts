import { query, queryOne } from "../db";
import { hashToken } from "../crypto";
import type { Session, SessionWithUser, UserRole, UserStatus } from "../types";

type SessionRow = {
  session_id: string;
  user_id: string;
  ip: string | null;
  user_agent: string | null;
  session_created_at: string;
  last_seen_at: string;
  expires_at: string;
};

type SessionUserRow = SessionRow & {
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
  role: UserRole;
  status: UserStatus;
  user_created_at: string;
};

function mapSession(row: SessionRow): Session {
  return {
    id: Number(row.session_id),
    userId: Number(row.user_id),
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.session_created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
  };
}

export async function createSession(input: {
  userId: number;
  token: string;
  ip: string;
  userAgent: string;
  expiresAt: Date;
}) {
  const row = await queryOne<SessionRow>(
    `insert into sessions (user_id, session_hash, ip, user_agent, expires_at)
     values ($1, $2, $3, $4, $5)
     returning
       id as session_id,
       user_id,
       ip,
       user_agent,
       created_at::text as session_created_at,
       last_seen_at::text,
       expires_at::text`,
    [
      input.userId,
      hashToken(input.token),
      input.ip,
      input.userAgent,
      input.expiresAt.toISOString(),
    ],
  );

  if (!row) {
    throw new Error("failed to create session");
  }

  return mapSession(row);
}

export async function findSessionByToken(token: string) {
  const row = await queryOne<SessionUserRow>(
    `update sessions s
        set last_seen_at = now()
       from users u
      where s.user_id = u.id
        and s.session_hash = $1
        and s.revoked_at is null
        and s.expires_at > $2
      returning
        s.id as session_id,
        s.user_id,
        s.ip,
        s.user_agent,
        s.created_at::text as session_created_at,
        s.last_seen_at::text,
        s.expires_at::text,
        u.public_id,
        u.first_name,
        u.username,
        u.bio,
        u.email,
        u.email_verified_at::text,
        u.dob::text,
        u.telegram_id,
        u.telegram_username,
        u.telegram_verified_at::text,
        u.role,
        u.status,
        u.created_at::text as user_created_at`,
    [hashToken(token), new Date().toISOString()],
  );

  if (!row) {
    return null;
  }

  return {
    session: mapSession(row),
    user: {
      id: Number(row.user_id),
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
      role: row.role,
      status: row.status,
      createdAt: row.user_created_at,
    },
  } satisfies SessionWithUser;
}

export async function listSessionsForUser(userId: number) {
  const rows = await query<SessionRow>(
    `select
       id as session_id,
       user_id,
       ip,
       user_agent,
       created_at::text as session_created_at,
       last_seen_at::text,
       expires_at::text
     from sessions
     where user_id = $1
       and revoked_at is null
       and expires_at > $2
     order by last_seen_at desc`,
    [userId, new Date().toISOString()],
  );
  return rows.map(mapSession);
}

export async function revokeSession(token: string) {
  await query(
    `update sessions set revoked_at = now() where session_hash = $1`,
    [hashToken(token)],
  );
}

export async function revokeSessionById(sessionId: number, userId: number) {
  await query(
    `update sessions set revoked_at = now() where id = $1 and user_id = $2`,
    [sessionId, userId],
  );
}

export async function revokeSessionsForUser(userId: number) {
  await query(
    `update sessions
        set revoked_at = now()
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
}

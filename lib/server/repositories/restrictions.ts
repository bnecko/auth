import { query, queryOne } from "../db";

export type RestrictionStatus = "active" | "appealed" | "closed" | "lifted";

export type UserRestriction = {
  id: number;
  publicId: string;
  userId: number;
  username: string | null;
  status: RestrictionStatus;
  triggerType: string;
  triggerCode: string;
  reason: string | null;
  securityThreadId: number | null;
  lastUserActivityAt: string | null;
  createdAt: string;
};

type RestrictionRow = {
  id: string;
  public_id: string;
  user_id: string;
  username: string | null;
  status: RestrictionStatus;
  trigger_type: string;
  trigger_code: string;
  reason: string | null;
  security_thread_id: string | null;
  last_user_activity_at: string | null;
  created_at: string;
};

function map(row: RestrictionRow): UserRestriction {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    userId: Number(row.user_id),
    username: row.username ?? null,
    status: row.status,
    triggerType: row.trigger_type,
    triggerCode: row.trigger_code,
    reason: row.reason,
    securityThreadId: row.security_thread_id ? Number(row.security_thread_id) : null,
    lastUserActivityAt: row.last_user_activity_at,
    createdAt: row.created_at,
  };
}

const select = `
  r.id, r.public_id, r.user_id, u.username, r.status, r.trigger_type,
  r.trigger_code, r.reason, r.security_thread_id,
  r.last_user_activity_at::text, r.created_at::text
`;

// Create the restriction row and flip the denormalized users.restricted flag.
// The caller creates the security thread first and passes its id.
export async function createRestriction(input: {
  publicId: string;
  userId: number;
  triggerType: string;
  triggerCode: string;
  reason: string | null;
  securityThreadId: number;
  suspicionEventId: number | null;
  restrictedByUserId: number | null;
}) {
  const row = await queryOne<RestrictionRow>(
    `insert into user_restrictions
       (public_id, user_id, trigger_type, trigger_code, reason,
        security_thread_id, suspicion_event_id, restricted_by_user_id,
        last_user_activity_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     returning id, public_id, user_id,
               null::text as username,
               status, trigger_type, trigger_code, reason, security_thread_id,
               last_user_activity_at::text, created_at::text`,
    [
      input.publicId,
      input.userId,
      input.triggerType,
      input.triggerCode,
      input.reason,
      input.securityThreadId,
      input.suspicionEventId,
      input.restrictedByUserId,
    ],
  );
  if (!row) throw new Error("failed to create restriction");
  await query(
    `update users set restricted = true, restricted_at = now() where id = $1`,
    [input.userId],
  );
  return map(row);
}

export async function findActiveRestrictionForUser(userId: number) {
  const row = await queryOne<RestrictionRow>(
    `select ${select}
       from user_restrictions r
       join users u on u.id = r.user_id
      where r.user_id = $1 and r.status = 'active'`,
    [userId],
  );
  return row ? map(row) : null;
}

export async function listActiveRestrictions(limit = 200) {
  const rows = await query<RestrictionRow>(
    `select ${select}
       from user_restrictions r
       join users u on u.id = r.user_id
      where r.status = 'active'
      order by r.created_at desc
      limit $1`,
    [limit],
  );
  return rows.map(map);
}

export async function touchRestrictionActivity(restrictionId: number) {
  await query(
    `update user_restrictions set last_user_activity_at = now() where id = $1`,
    [restrictionId],
  );
}

// Lift the active restriction and clear the user flag. Returns the userId so the
// caller can also restore status if needed.
export async function liftRestriction(publicId: string) {
  const row = await queryOne<{ user_id: string }>(
    `update user_restrictions
        set status = 'lifted', lifted_at = now()
      where public_id = $1 and status = 'active'
      returning user_id`,
    [publicId],
  );
  if (!row) return null;
  const userId = Number(row.user_id);
  await query(
    `update users set restricted = false, restricted_at = null where id = $1`,
    [userId],
  );
  return userId;
}

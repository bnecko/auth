import { query, queryOne } from "../db";

export type ProfileChangeField = "username" | "email";
export type ProfileChangeStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "cancelled";

export type ProfileChangeRequest = {
  id: number;
  publicId: string;
  userId: number;
  field: ProfileChangeField;
  newValue: string;
  newValueNormalized: string;
  status: ProfileChangeStatus;
  expiresAt: string;
};

type ProfileChangeRow = {
  id: string;
  public_id: string;
  user_id: string;
  field: ProfileChangeField;
  new_value: string;
  new_value_normalized: string;
  status: ProfileChangeStatus;
  expires_at: string;
};

const select = `
  id,
  public_id,
  user_id,
  field,
  new_value,
  new_value_normalized,
  status,
  expires_at::text
`;

function map(row: ProfileChangeRow): ProfileChangeRequest {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    userId: Number(row.user_id),
    field: row.field,
    newValue: row.new_value,
    newValueNormalized: row.new_value_normalized,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

export async function createProfileChangeRequest(input: {
  publicId: string;
  userId: number;
  field: ProfileChangeField;
  newValue: string;
  newValueNormalized: string;
  ip: string;
  userAgent: string;
  expiresAt: Date;
}) {
  const row = await queryOne<ProfileChangeRow>(
    `insert into profile_change_requests
       (public_id, user_id, field, new_value, new_value_normalized, ip, user_agent, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning ${select}`,
    [
      input.publicId,
      input.userId,
      input.field,
      input.newValue,
      input.newValueNormalized,
      input.ip,
      input.userAgent,
      input.expiresAt.toISOString(),
    ],
  );
  if (!row) {
    throw new Error("failed to create profile change request");
  }
  return map(row);
}

export async function listPendingProfileChangesForUser(userId: number) {
  const rows = await query<ProfileChangeRow>(
    `select ${select}
       from profile_change_requests
      where user_id = $1 and status = 'pending' and expires_at > now()
      order by created_at desc`,
    [userId],
  );
  return rows.map(map);
}

export async function findPendingProfileChangeRequest(publicId: string) {
  const row = await queryOne<ProfileChangeRow>(
    `select ${select}
       from profile_change_requests
      where public_id = $1 and status = 'pending' and expires_at > now()`,
    [publicId],
  );
  return row ? map(row) : null;
}

export async function markProfileChangeApproved(publicId: string) {
  const row = await queryOne<ProfileChangeRow>(
    `update profile_change_requests
        set status = 'approved', decided_at = now()
      where public_id = $1 and status = 'pending' and expires_at > now()
      returning ${select}`,
    [publicId],
  );
  return row ? map(row) : null;
}

export async function markProfileChangeDenied(publicId: string) {
  const row = await queryOne<ProfileChangeRow>(
    `update profile_change_requests
        set status = 'denied', decided_at = now()
      where public_id = $1 and status = 'pending'
      returning ${select}`,
    [publicId],
  );
  return row ? map(row) : null;
}

// Worker hygiene: expire stale pending requests so they stop counting.
export async function purgeExpiredProfileChangeRequests() {
  return query(
    `update profile_change_requests
        set status = 'expired'
      where status = 'pending' and expires_at < now()`,
  );
}

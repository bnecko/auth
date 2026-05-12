import { query, queryOne } from "../db";
import type { BearerRequest, BearerRequestStatus } from "../types";

type BearerRequestRow = {
  id: string;
  public_id: string;
  user_id: string;
  app_name: string;
  reason: string;
  status: BearerRequestStatus;
  external_app_id: string | null;
  has_plaintext: boolean;
  decided_by_telegram_id: string | null;
  decided_at: string | null;
  revealed_at: string | null;
  cleared_at: string | null;
  created_at: string;
};

function mapBearerRequest(row: BearerRequestRow): BearerRequest {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    userId: Number(row.user_id),
    appName: row.app_name,
    reason: row.reason,
    status: row.status,
    externalAppId: row.external_app_id ? Number(row.external_app_id) : null,
    hasPlaintext: row.has_plaintext,
    decidedByTelegramId: row.decided_by_telegram_id,
    decidedAt: row.decided_at,
    revealedAt: row.revealed_at,
    clearedAt: row.cleared_at,
    createdAt: row.created_at,
  };
}

// plaintext_key is intentionally not selected: the only callers that need
// it are revealBearerRequestKey/clearBearerRequestKey, which select it
// in the same atomic update. Everywhere else we expose only a boolean
// for "is the plaintext still retrievable".
const bearerSelect = `
  id,
  public_id,
  user_id,
  app_name,
  reason,
  status,
  external_app_id,
  (plaintext_key is not null) as has_plaintext,
  decided_by_telegram_id,
  decided_at::text,
  revealed_at::text,
  cleared_at::text,
  created_at::text
`;

export async function createBearerRequest(input: {
  publicId: string;
  userId: number;
  appName: string;
  reason: string;
}) {
  const row = await queryOne<BearerRequestRow>(
    `insert into bearer_requests (public_id, user_id, app_name, reason)
     values ($1, $2, $3, $4)
     returning ${bearerSelect}`,
    [input.publicId, input.userId, input.appName, input.reason],
  );

  if (!row) {
    throw new Error("failed to create bearer request");
  }

  return mapBearerRequest(row);
}

export async function findBearerRequestByPublicId(publicId: string) {
  const row = await queryOne<BearerRequestRow>(
    `select ${bearerSelect}
       from bearer_requests
      where public_id = $1`,
    [publicId],
  );
  return row ? mapBearerRequest(row) : null;
}

export async function listBearerRequestsForUser(userId: number) {
  const rows = await query<BearerRequestRow>(
    `select ${bearerSelect}
       from bearer_requests
      where user_id = $1
      order by created_at desc`,
    [userId],
  );
  return rows.map(mapBearerRequest);
}

export async function countPendingBearerRequestsForUser(userId: number) {
  const row = await queryOne<{ count: number }>(
    `select count(*)::int as count
       from bearer_requests
      where user_id = $1 and status = 'pending'`,
    [userId],
  );
  return row?.count || 0;
}

// Atomically transition pending -> approved and stash the generated
// plaintext key. Only succeeds for rows still in pending status, so
// double-clicks on the Telegram approve button can't issue two keys.
export async function approveBearerRequest(input: {
  publicId: string;
  externalAppId: number;
  plaintextKey: string;
  decidedByTelegramId: string;
}) {
  const row = await queryOne<BearerRequestRow>(
    `update bearer_requests
        set status = 'approved',
            external_app_id = $2,
            plaintext_key = $3,
            decided_by_telegram_id = $4,
            decided_at = now()
      where public_id = $1 and status = 'pending'
      returning ${bearerSelect}`,
    [
      input.publicId,
      input.externalAppId,
      input.plaintextKey,
      input.decidedByTelegramId,
    ],
  );
  return row ? mapBearerRequest(row) : null;
}

export async function rejectBearerRequest(
  publicId: string,
  decidedByTelegramId: string,
) {
  const row = await queryOne<BearerRequestRow>(
    `update bearer_requests
        set status = 'rejected',
            decided_by_telegram_id = $2,
            decided_at = now()
      where public_id = $1 and status = 'pending'
      returning ${bearerSelect}`,
    [publicId, decidedByTelegramId],
  );
  return row ? mapBearerRequest(row) : null;
}

// Atomically reveals the plaintext once and clears it in the same
// statement. After this returns, the plaintext_key column is null and
// the request transitions to 'cleared'. We never leave a retrievable
// plaintext sitting in the DB across requests — a leaked replica or
// stolen snapshot only exposes keys that haven't been read yet.
export async function readBearerRequestPlaintext(
  publicId: string,
  userId: number,
) {
  const row = await queryOne<{ plaintext_key: string | null }>(
    `with prior as (
       select plaintext_key
         from bearer_requests
        where public_id = $1
          and user_id = $2
          and status = 'approved'
          and plaintext_key is not null
        for update
     )
     update bearer_requests
        set plaintext_key = null,
            revealed_at = coalesce(revealed_at, now()),
            cleared_at = now(),
            status = 'cleared'
      where public_id = $1
        and user_id = $2
        and status = 'approved'
        and plaintext_key is not null
      returning (select plaintext_key from prior) as plaintext_key`,
    [publicId, userId],
  );
  return row?.plaintext_key || null;
}

// Used when the user dismisses a request without ever revealing the
// key — for example they got the key out-of-band, or they want to
// abandon the issued credential. The reveal path already clears the
// plaintext atomically; this is the abandon path.
export async function clearBearerRequestKey(
  publicId: string,
  userId: number,
) {
  const row = await queryOne<BearerRequestRow>(
    `update bearer_requests
        set plaintext_key = null,
            cleared_at = now(),
            status = 'cleared'
      where public_id = $1 and user_id = $2 and status = 'approved'
      returning ${bearerSelect}`,
    [publicId, userId],
  );
  return row ? mapBearerRequest(row) : null;
}

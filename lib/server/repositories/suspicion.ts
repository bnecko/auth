import { query, queryOne } from "../db";

export type SuspicionStatus = "pending" | "actioned" | "dismissed";

export type SuspicionEvent = {
  id: number;
  publicId: string;
  userId: number | null;
  username: string | null;
  triggerType: string;
  score: number;
  reasons: string[];
  status: SuspicionStatus;
  createdAt: string;
};

type SuspicionRow = {
  id: string;
  public_id: string;
  user_id: string | null;
  username: string | null;
  trigger_type: string;
  score: number;
  reasons: unknown;
  status: SuspicionStatus;
  created_at: string;
};

function map(row: SuspicionRow): SuspicionEvent {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    userId: row.user_id ? Number(row.user_id) : null,
    username: row.username ?? null,
    triggerType: row.trigger_type,
    score: Number(row.score),
    reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function recordSuspicionEvent(input: {
  publicId: string;
  userId: number | null;
  triggerType: string;
  score: number;
  reasons: string[];
}) {
  await query(
    `insert into suspicion_events (public_id, user_id, trigger_type, score, reasons)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.publicId,
      input.userId,
      input.triggerType,
      input.score,
      JSON.stringify(input.reasons),
    ],
  );
}

export async function listSuspicionQueue(limit = 100) {
  const rows = await query<SuspicionRow>(
    `select s.id, s.public_id, s.user_id, u.username, s.trigger_type, s.score,
            s.reasons, s.status, s.created_at::text
       from suspicion_events s
       left join users u on u.id = s.user_id
      where s.status = 'pending'
      order by s.created_at desc
      limit $1`,
    [limit],
  );
  return rows.map(map);
}

export async function setSuspicionStatus(input: {
  publicId: string;
  status: "actioned" | "dismissed";
  reviewedByUserId: number;
}) {
  await query(
    `update suspicion_events
        set status = $2, reviewed_by_user_id = $3
      where public_id = $1 and status = 'pending'`,
    [input.publicId, input.status, input.reviewedByUserId],
  );
}

export async function findSuspicionEvent(publicId: string) {
  const row = await queryOne<SuspicionRow>(
    `select s.id, s.public_id, s.user_id, null::text as username, s.trigger_type,
            s.score, s.reasons, s.status, s.created_at::text
       from suspicion_events s
      where s.public_id = $1`,
    [publicId],
  );
  return row ? map(row) : null;
}

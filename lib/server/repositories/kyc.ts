import { query, queryOne } from "../db";

export type KycStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_user"
  | "in_review"
  | "approved"
  | "declined"
  | "expired"
  | "abandoned";

export type KycApplication = {
  status: KycStatus;
  sessionId: string | null;
  decidedAt: Date | null;
};

export async function findKycApplication(userId: number): Promise<KycApplication | null> {
  const row = await queryOne<{ status: KycStatus; session_id: string | null; decided_at: Date | null }>(
    `select status, session_id, decided_at from kyc_applications where user_id = $1`,
    [userId],
  );
  return row ? { status: row.status, sessionId: row.session_id, decidedAt: row.decided_at } : null;
}

/**
 * Records that a user has been sent to the provider.
 *
 * Deliberately refuses to overwrite an approval. A user who starts a second
 * session after passing would otherwise drop themselves back to in_progress
 * and lose the ability to withdraw until the new session finished, which is a
 * footgun a stray click should not be able to fire.
 */
export async function startKycSession(userId: number, sessionId: string): Promise<void> {
  await query(
    `insert into kyc_applications (user_id, session_id, status)
          values ($1, $2, 'in_progress')
     on conflict (user_id) do update
        set session_id = excluded.session_id,
            status = case when kyc_applications.status = 'approved'
                          then kyc_applications.status else 'in_progress' end,
            updated_at = now()`,
    [userId, sessionId],
  );
}

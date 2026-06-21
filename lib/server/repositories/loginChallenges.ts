import { queryOne } from "../db";
import { hashToken } from "../crypto";

export type LoginChallengeStatus =
  | "pending"
  | "approved"
  | "verified"
  | "expired"
  | "cancelled";

export type LoginChallenge = {
  id: number;
  publicId: string;
  userId: number;
  remember: boolean;
  status: LoginChallengeStatus;
  ip: string | null;
  // Only populated by the queries that join `users` (the alias selects);
  // null for the bare-table selects that never look at the account.
  username: string | null;
  expiresAt: string;
};

type LoginChallengeRow = {
  id: string;
  public_id: string;
  user_id: string;
  remember_me: boolean;
  status: LoginChallengeStatus;
  ip: string | null;
  username?: string | null;
  expires_at: string;
};

const challengeSelect = `
  id,
  public_id,
  user_id,
  remember_me,
  status,
  ip,
  expires_at::text
`;

const challengeSelectWithAlias = `
  tlc.id,
  tlc.public_id,
  tlc.user_id,
  tlc.remember_me,
  tlc.status,
  tlc.ip,
  u.username,
  tlc.expires_at::text
`;

function mapChallenge(row: LoginChallengeRow): LoginChallenge {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    userId: Number(row.user_id),
    remember: row.remember_me,
    status: row.status,
    ip: row.ip,
    username: row.username ?? null,
    expiresAt: row.expires_at,
  };
}

export async function createLoginChallenge(input: {
  publicId: string;
  userId: number;
  startToken: string;
  browserToken: string;
  remember: boolean;
  ip: string;
  userAgent: string;
  expiresAt: Date;
}) {
  const row = await queryOne<LoginChallengeRow>(
    `insert into telegram_login_challenges (
       public_id,
       user_id,
       start_token_hash,
       browser_token_hash,
       remember_me,
       ip,
       user_agent,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning ${challengeSelect}`,
    [
      input.publicId,
      input.userId,
      hashToken(input.startToken),
      hashToken(input.browserToken),
      input.remember,
      input.ip,
      input.userAgent,
      input.expiresAt.toISOString(),
    ],
  );

  if (!row) {
    throw new Error("failed to create login challenge");
  }

  return mapChallenge(row);
}

export async function findLoginChallenge(publicId: string) {
  const row = await queryOne<LoginChallengeRow>(
    `select ${challengeSelect}
       from telegram_login_challenges
      where public_id = $1`,
    [publicId],
  );
  return row ? mapChallenge(row) : null;
}

// Find the pending challenge a /start token refers to, scoped to the Telegram
// account it was issued for. Does NOT change status - the user still has to
// approve via the inline buttons.
export async function findPendingLoginChallengeByStartToken(input: {
  startToken: string;
  telegramId: string;
}) {
  const row = await queryOne<LoginChallengeRow>(
    `select ${challengeSelectWithAlias}
       from telegram_login_challenges tlc
       join users u on u.id = tlc.user_id
      where tlc.start_token_hash = $1
        and u.telegram_id = $2
        and tlc.status = 'pending'
        and tlc.expires_at > $3`,
    [hashToken(input.startToken), input.telegramId, new Date().toISOString()],
  );
  return row ? mapChallenge(row) : null;
}

// Approve (the user tapped "Log in" in Telegram): move pending -> approved and
// stash the 6-digit code hash, scoped to the approving Telegram account. The
// user still has to enter the code on the web to finish (completeLoginChallenge).
export async function markLoginChallengeApproved(input: {
  publicId: string;
  telegramId: string;
  codeHash: string;
}) {
  const row = await queryOne<LoginChallengeRow>(
    `update telegram_login_challenges tlc
        set status = 'approved',
            code_hash = $4
       from users u
      where tlc.user_id = u.id
        and tlc.public_id = $1
        and u.telegram_id = $2
        and tlc.status = 'pending'
        and tlc.expires_at > $3
      returning ${challengeSelectWithAlias}`,
    [input.publicId, input.telegramId, new Date().toISOString(), input.codeHash],
  );
  return row ? mapChallenge(row) : null;
}

// Deny: cancel the pending challenge (same scoping as approve).
export async function markLoginChallengeDenied(input: {
  publicId: string;
  telegramId: string;
}) {
  const row = await queryOne<LoginChallengeRow>(
    `update telegram_login_challenges tlc
        set status = 'cancelled'
       from users u
      where tlc.user_id = u.id
        and tlc.public_id = $1
        and u.telegram_id = $2
        and tlc.status = 'pending'
      returning ${challengeSelectWithAlias}`,
    [input.publicId, input.telegramId],
  );
  return row ? mapChallenge(row) : null;
}

// Kill a challenge after too many wrong codes, so even the correct code can no
// longer complete it - the user must start a fresh login.
export async function cancelLoginChallenge(publicId: string) {
  await queryOne<LoginChallengeRow>(
    `update telegram_login_challenges
        set status = 'cancelled'
      where public_id = $1
        and status in ('pending', 'approved')
      returning ${challengeSelect}`,
    [publicId],
  );
}

// Final step: verify the 6-digit code against an approved challenge and consume
// it (approved -> verified) so the same code can't be reused. Scoped to the
// browser that started the login + the exact code hash.
export async function completeLoginChallenge(input: {
  publicId: string;
  browserToken: string;
  codeHash: string;
}) {
  const row = await queryOne<LoginChallengeRow>(
    `update telegram_login_challenges
        set status = 'verified',
            verified_at = now()
      where public_id = $1
        and browser_token_hash = $2
        and code_hash = $4
        and status = 'approved'
        and expires_at > $3
      returning ${challengeSelect}`,
    [
      input.publicId,
      hashToken(input.browserToken),
      new Date().toISOString(),
      input.codeHash,
    ],
  );
  return row ? mapChallenge(row) : null;
}

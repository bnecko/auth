import { queryOne } from "../db";
import { hashToken } from "../crypto";

export type LoginChallengeStatus =
  | "pending"
  | "verified"
  | "expired"
  | "cancelled";

export type LoginChallenge = {
  id: number;
  publicId: string;
  userId: number;
  remember: boolean;
  status: LoginChallengeStatus;
  expiresAt: string;
};

type LoginChallengeRow = {
  id: string;
  public_id: string;
  user_id: string;
  remember_me: boolean;
  status: LoginChallengeStatus;
  expires_at: string;
};

const challengeSelect = `
  id,
  public_id,
  user_id,
  remember_me,
  status,
  expires_at::text
`;

const challengeSelectWithAlias = `
  tlc.id,
  tlc.public_id,
  tlc.user_id,
  tlc.remember_me,
  tlc.status,
  tlc.expires_at::text
`;

function mapChallenge(row: LoginChallengeRow): LoginChallenge {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    userId: Number(row.user_id),
    remember: row.remember_me,
    status: row.status,
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

export async function verifyLoginChallengeByStartToken(input: {
  startToken: string;
  telegramId: string;
}) {
  const row = await queryOne<LoginChallengeRow>(
    `update telegram_login_challenges tlc
        set status = 'verified',
            verified_at = now()
       from users u
      where tlc.user_id = u.id
        and tlc.start_token_hash = $1
        and u.telegram_id = $2
        and tlc.status = 'pending'
        and tlc.expires_at > now()
      returning ${challengeSelectWithAlias}`,
    [hashToken(input.startToken), input.telegramId],
  );
  return row ? mapChallenge(row) : null;
}

export async function completeLoginChallenge(input: {
  publicId: string;
  browserToken: string;
}) {
  const row = await queryOne<LoginChallengeRow>(
    `update telegram_login_challenges
        set status = 'cancelled'
      where public_id = $1
        and browser_token_hash = $2
        and status = 'verified'
        and expires_at > now()
      returning ${challengeSelect}`,
    [input.publicId, hashToken(input.browserToken)],
  );
  return row ? mapChallenge(row) : null;
}

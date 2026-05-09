import { query, queryOne } from "../db";
import { hashToken } from "../crypto";
import type { ExternalApp, User } from "../types";

export type OAuthAuthorizationCode = {
  id: number;
  appId: number;
  userId: number;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scopes: string[];
  nonce: string | null;
  expiresAt: string;
  consumedAt: string | null;
};

export type OAuthTokenGrant = {
  id: number;
  appId: number;
  userId: number;
  scopes: string[];
  expiresAt: string;
  revokedAt: string | null;
};

export type OAuthAccessTokenWithUser = OAuthTokenGrant & {
  app: ExternalApp;
  user: User;
};

type CodeRow = {
  id: string;
  external_app_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  scopes: string[];
  nonce: string | null;
  expires_at: string;
  consumed_at: string | null;
};

type TokenRow = {
  id: string;
  external_app_id: string;
  user_id: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
};

type AccessTokenWithUserRow = TokenRow & {
  app_public_id: string;
  app_name: string;
  app_slug: string;
  app_callback_url: string | null;
  app_allowed_redirect_urls: string[];
  app_required_product: string | null;
  app_status: ExternalApp["status"];
  user_public_id: string;
  user_first_name: string;
  user_username: string;
  user_bio: string | null;
  user_email: string;
  user_email_verified_at: string | null;
  user_dob: string | null;
  user_telegram_id: string | null;
  user_telegram_username: string | null;
  user_telegram_verified_at: string | null;
  user_role: User["role"];
  user_status: User["status"];
  user_created_at: string;
};

const codeSelect = `
  id,
  external_app_id,
  user_id,
  redirect_uri,
  code_challenge,
  code_challenge_method,
  scopes,
  nonce,
  expires_at::text,
  consumed_at::text
`;

function mapCode(row: CodeRow): OAuthAuthorizationCode {
  return {
    id: Number(row.id),
    appId: Number(row.external_app_id),
    userId: Number(row.user_id),
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: row.code_challenge_method,
    scopes: row.scopes || [],
    nonce: row.nonce,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

function mapToken(row: TokenRow): OAuthTokenGrant {
  return {
    id: Number(row.id),
    appId: Number(row.external_app_id),
    userId: Number(row.user_id),
    scopes: row.scopes || [],
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export async function createAuthorizationCode(input: {
  code: string;
  appId: number;
  userId: number;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  nonce: string | null;
  ip: string;
  userAgent: string;
  expiresAt: Date;
}) {
  const row = await queryOne<CodeRow>(
    `insert into oauth_authorization_codes (
       code_hash,
       external_app_id,
       user_id,
       redirect_uri,
       code_challenge,
       code_challenge_method,
       scopes,
       nonce,
       ip,
       user_agent,
       expires_at
     )
     values ($1, $2, $3, $4, $5, 'S256', $6, $7, $8, $9, $10)
     returning ${codeSelect}`,
    [
      hashToken(input.code),
      input.appId,
      input.userId,
      input.redirectUri,
      input.codeChallenge,
      input.scopes,
      input.nonce,
      input.ip,
      input.userAgent,
      input.expiresAt.toISOString(),
    ],
  );

  if (!row) {
    throw new Error("failed to create authorization code");
  }

  return mapCode(row);
}

export async function consumeAuthorizationCode(code: string) {
  const row = await queryOne<CodeRow>(
    `update oauth_authorization_codes
        set consumed_at = now()
      where code_hash = $1
        and consumed_at is null
        and expires_at > now()
      returning ${codeSelect}`,
    [hashToken(code)],
  );
  return row ? mapCode(row) : null;
}

export async function findAuthorizationCode(code: string) {
  const row = await queryOne<CodeRow>(
    `select ${codeSelect}
       from oauth_authorization_codes
      where code_hash = $1
        and consumed_at is null
        and expires_at > now()`,
    [hashToken(code)],
  );
  return row ? mapCode(row) : null;
}

export async function markAuthorizationCodeConsumed(id: number) {
  const row = await queryOne<CodeRow>(
    `update oauth_authorization_codes
        set consumed_at = now()
      where id = $1
        and consumed_at is null
        and expires_at > now()
      returning ${codeSelect}`,
    [id],
  );
  return row ? mapCode(row) : null;
}

export async function createAccessToken(input: {
  token: string;
  appId: number;
  userId: number;
  scopes: string[];
  expiresAt: Date;
}) {
  const row = await queryOne<TokenRow>(
    `insert into oauth_access_tokens (
       token_hash,
       external_app_id,
       user_id,
       scopes,
       expires_at
     )
     values ($1, $2, $3, $4, $5)
     returning id, external_app_id, user_id, scopes, expires_at::text, revoked_at::text`,
    [
      hashToken(input.token),
      input.appId,
      input.userId,
      input.scopes,
      input.expiresAt.toISOString(),
    ],
  );

  if (!row) {
    throw new Error("failed to create access token");
  }

  return mapToken(row);
}

export async function createRefreshToken(input: {
  token: string;
  appId: number;
  userId: number;
  scopes: string[];
  expiresAt: Date;
}) {
  const row = await queryOne<TokenRow>(
    `insert into oauth_refresh_tokens (
       token_hash,
       external_app_id,
       user_id,
       scopes,
       expires_at
     )
     values ($1, $2, $3, $4, $5)
     returning id, external_app_id, user_id, scopes, expires_at::text, revoked_at::text`,
    [
      hashToken(input.token),
      input.appId,
      input.userId,
      input.scopes,
      input.expiresAt.toISOString(),
    ],
  );

  if (!row) {
    throw new Error("failed to create refresh token");
  }

  return mapToken(row);
}

export async function rotateRefreshToken(
  refreshToken: string,
  replacementToken: string,
  appId: number,
) {
  const row = await queryOne<TokenRow>(
    `update oauth_refresh_tokens
        set revoked_at = now(),
            replaced_by_hash = $2
      where token_hash = $1
        and external_app_id = $3
        and revoked_at is null
        and expires_at > now()
      returning id, external_app_id, user_id, scopes, expires_at::text, revoked_at::text`,
    [hashToken(refreshToken), hashToken(replacementToken), appId],
  );
  return row ? mapToken(row) : null;
}

export async function findAccessToken(token: string) {
  const row = await queryOne<AccessTokenWithUserRow>(
    `select
       oat.id,
       oat.external_app_id,
       oat.user_id,
       oat.scopes,
       oat.expires_at::text,
       oat.revoked_at::text,
       ea.public_id as app_public_id,
       ea.name as app_name,
       ea.slug as app_slug,
       ea.callback_url as app_callback_url,
       ea.allowed_redirect_urls as app_allowed_redirect_urls,
       ea.required_product as app_required_product,
       ea.status as app_status,
       u.public_id as user_public_id,
       u.first_name as user_first_name,
       u.username as user_username,
       u.bio as user_bio,
       u.email as user_email,
       u.email_verified_at::text as user_email_verified_at,
       u.dob::text as user_dob,
       u.telegram_id as user_telegram_id,
       u.telegram_username as user_telegram_username,
       u.telegram_verified_at::text as user_telegram_verified_at,
       u.role as user_role,
       u.status as user_status,
       u.created_at::text as user_created_at
     from oauth_access_tokens oat
     join external_apps ea on ea.id = oat.external_app_id
     join users u on u.id = oat.user_id
     where oat.token_hash = $1
       and oat.revoked_at is null
       and oat.expires_at > now()`,
    [hashToken(token)],
  );

  if (!row) {
    return null;
  }

  return {
    ...mapToken(row),
    app: {
      id: Number(row.external_app_id),
      publicId: row.app_public_id,
      name: row.app_name,
      slug: row.app_slug,
      callbackUrl: row.app_callback_url,
      allowedRedirectUrls: row.app_allowed_redirect_urls || [],
      requiredProduct: row.app_required_product,
      status: row.app_status,
    },
    user: {
      id: Number(row.user_id),
      publicId: row.user_public_id,
      firstName: row.user_first_name,
      username: row.user_username,
      bio: row.user_bio,
      email: row.user_email,
      emailVerifiedAt: row.user_email_verified_at,
      dob: row.user_dob,
      telegramId: row.user_telegram_id,
      telegramUsername: row.user_telegram_username,
      telegramVerifiedAt: row.user_telegram_verified_at,
      role: row.user_role,
      status: row.user_status,
      createdAt: row.user_created_at,
    },
  };
}

export async function revokeAccessTokensForRefreshGrant(input: {
  appId: number;
  userId: number;
}) {
  await query(
    `update oauth_access_tokens
        set revoked_at = now()
      where external_app_id = $1
        and user_id = $2
        and revoked_at is null`,
    [input.appId, input.userId],
  );
}

export async function revokeAccessToken(token: string, appId: number) {
  await query(
    `update oauth_access_tokens
        set revoked_at = now()
      where token_hash = $1
        and external_app_id = $2
        and revoked_at is null`,
    [hashToken(token), appId],
  );
}

export async function revokeRefreshToken(token: string, appId: number) {
  await query(
    `update oauth_refresh_tokens
        set revoked_at = now()
      where token_hash = $1
        and external_app_id = $2
        and revoked_at is null`,
    [hashToken(token), appId],
  );
}

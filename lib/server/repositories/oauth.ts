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
  authTime: string | null;
};

export type OAuthTokenGrant = {
  id: number;
  appId: number;
  userId: number | null;
  subject: string;
  tokenKind: "user" | "client";
  scopes: string[];
  expiresAt: string;
  revokedAt: string | null;
};

export type OAuthAccessTokenWithUser = OAuthTokenGrant & {
  app: ExternalApp;
  user: User | null;
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
  auth_time: string | null;
};

type TokenRow = {
  id: string;
  external_app_id: string;
  user_id: string | null;
  subject?: string;
  token_kind?: "user" | "client";
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
};

type AccessTokenWithUserRow = TokenRow & {
  app_public_id: string;
  app_name: string;
  app_slug: string;
  app_owner_user_id: string | null;
  app_callback_url: string | null;
  app_allowed_redirect_urls: string[];
  app_client_type: ExternalApp["clientType"];
  app_token_endpoint_auth_method: ExternalApp["tokenEndpointAuthMethod"];
  app_allowed_grant_types: string[];
  app_allowed_scopes: string[];
  app_issue_refresh_tokens: boolean;
  app_oauth_profile_version: string;
  app_required_product: string | null;
  app_status: ExternalApp["status"];
  user_public_id: string | null;
  user_first_name: string | null;
  user_username: string | null;
  user_bio: string | null;
  user_email: string | null;
  user_email_verified_at: string | null;
  user_dob: string | null;
  user_telegram_id: string | null;
  user_telegram_username: string | null;
  user_telegram_verified_at: string | null;
  user_role: User["role"] | null;
  user_status: User["status"] | null;
  user_created_at: string | null;
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
  consumed_at::text,
  auth_time::text
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
    authTime: row.auth_time,
  };
}

function mapToken(row: TokenRow): OAuthTokenGrant {
  return {
    id: Number(row.id),
    appId: Number(row.external_app_id),
    userId: row.user_id ? Number(row.user_id) : null,
    subject: row.subject || "",
    tokenKind: row.token_kind || "user",
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
  authTime: Date;
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
       expires_at,
       auth_time
     )
     values ($1, $2, $3, $4, $5, 'S256', $6, $7, $8, $9, $10, $11)
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
      input.authTime.toISOString(),
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
        and expires_at > $2
      returning ${codeSelect}`,
    [hashToken(code), new Date().toISOString()],
  );
  return row ? mapCode(row) : null;
}

export async function findAuthorizationCode(code: string) {
  const row = await queryOne<CodeRow>(
    `select ${codeSelect}
       from oauth_authorization_codes
      where code_hash = $1
        and consumed_at is null
        and expires_at > $2`,
    [hashToken(code), new Date().toISOString()],
  );
  return row ? mapCode(row) : null;
}

export async function markAuthorizationCodeConsumed(id: number) {
  const row = await queryOne<CodeRow>(
    `update oauth_authorization_codes
        set consumed_at = now()
      where id = $1
        and consumed_at is null
        and expires_at > $2
      returning ${codeSelect}`,
    [id, new Date().toISOString()],
  );
  return row ? mapCode(row) : null;
}

export async function createAccessToken(input: {
  token: string;
  appId: number;
  userId: number | null;
  subject: string;
  tokenKind: "user" | "client";
  scopes: string[];
  expiresAt: Date;
}) {
  const row = await queryOne<TokenRow>(
    `insert into oauth_access_tokens (
       token_hash,
       external_app_id,
       user_id,
       subject,
       token_kind,
       scopes,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, external_app_id, user_id, subject, token_kind, scopes, expires_at::text, revoked_at::text`,
    [
      hashToken(input.token),
      input.appId,
      input.userId,
      input.subject,
      input.tokenKind,
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
  authTime: Date | null;
}) {
  const row = await queryOne<TokenRow & { auth_time: string | null }>(
    `insert into oauth_refresh_tokens (
       token_hash,
       external_app_id,
       user_id,
       scopes,
       expires_at,
       auth_time
     )
     values ($1, $2, $3, $4, $5, $6)
     returning id, external_app_id, user_id, scopes, expires_at::text, revoked_at::text, auth_time::text`,
    [
      hashToken(input.token),
      input.appId,
      input.userId,
      input.scopes,
      input.expiresAt.toISOString(),
      input.authTime ? input.authTime.toISOString() : null,
    ],
  );

  if (!row) {
    throw new Error("failed to create refresh token");
  }

  return { ...mapToken(row), authTime: row.auth_time };
}

export async function rotateRefreshToken(
  refreshToken: string,
  replacementToken: string,
  appId: number,
) {
  const row = await queryOne<TokenRow & { auth_time: string | null }>(
    `update oauth_refresh_tokens
        set revoked_at = now(),
            replaced_by_hash = $2
      where token_hash = $1
        and external_app_id = $3
        and revoked_at is null
        and expires_at > $4
      returning id, external_app_id, user_id, scopes, expires_at::text, revoked_at::text, auth_time::text`,
    [hashToken(refreshToken), hashToken(replacementToken), appId, new Date().toISOString()],
  );
  return row ? { ...mapToken(row), authTime: row.auth_time } : null;
}

export async function findAccessToken(token: string) {
  const row = await queryOne<AccessTokenWithUserRow>(
    `select
       oat.id,
       oat.external_app_id,
       oat.user_id,
       oat.subject,
       oat.token_kind,
       oat.scopes,
       oat.expires_at::text,
       oat.revoked_at::text,
       ea.public_id as app_public_id,
       ea.name as app_name,
       ea.slug as app_slug,
       ea.owner_user_id as app_owner_user_id,
       ea.callback_url as app_callback_url,
       ea.allowed_redirect_urls as app_allowed_redirect_urls,
       ea.client_type as app_client_type,
       ea.token_endpoint_auth_method as app_token_endpoint_auth_method,
       ea.allowed_grant_types as app_allowed_grant_types,
       ea.allowed_scopes as app_allowed_scopes,
       ea.issue_refresh_tokens as app_issue_refresh_tokens,
       ea.oauth_profile_version as app_oauth_profile_version,
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
     left join users u on u.id = oat.user_id
     where oat.token_hash = $1
       and oat.revoked_at is null
       and oat.expires_at > $2`,
    [hashToken(token), new Date().toISOString()],
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
      ownerUserId: row.app_owner_user_id ? Number(row.app_owner_user_id) : null,
      callbackUrl: row.app_callback_url,
      allowedRedirectUrls: row.app_allowed_redirect_urls || [],
      clientType: row.app_client_type,
      tokenEndpointAuthMethod: row.app_token_endpoint_auth_method,
      allowedGrantTypes: row.app_allowed_grant_types || [],
      allowedScopes: row.app_allowed_scopes || [],
      issueRefreshTokens: row.app_issue_refresh_tokens,
      oauthProfileVersion: row.app_oauth_profile_version,
      requiredProduct: row.app_required_product,
      status: row.app_status,
    },
    user: row.user_id && row.user_public_id && row.user_first_name && row.user_username && row.user_email && row.user_role && row.user_status && row.user_created_at
      ? {
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
        }
      : null,
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

export async function revokeRefreshTokensByUserAndApp(input: {
  appId: number;
  userId: number;
}) {
  await query(
    `update oauth_refresh_tokens
        set revoked_at = now()
      where external_app_id = $1
        and user_id = $2
        and revoked_at is null`,
    [input.appId, input.userId],
  );
}

// Returns the app/user context for a refresh token that was rotated out
// (replaced_by_hash is set). Used to detect replay attacks: presenting a
// previously-rotated token means the grant family is poisoned and every
// active token for that (app, user) must be revoked.
export async function findRotatedRefreshTokenContext(token: string) {
  const row = await queryOne<{
    external_app_id: string;
    user_id: string;
    auth_time: string | null;
  }>(
    `select external_app_id, user_id, auth_time::text
       from oauth_refresh_tokens
      where token_hash = $1
        and revoked_at is not null
        and replaced_by_hash is not null`,
    [hashToken(token)],
  );
  if (!row) return null;
  return {
    appId: Number(row.external_app_id),
    userId: Number(row.user_id),
    authTime: row.auth_time,
  };
}

export async function revokeAllTokensForUserAndApp(input: {
  appId: number;
  userId: number;
}) {
  await query(
    `update oauth_access_tokens
        set revoked_at = now()
      where external_app_id = $1 and user_id = $2 and revoked_at is null`,
    [input.appId, input.userId],
  );
  await query(
    `update oauth_refresh_tokens
        set revoked_at = now()
      where external_app_id = $1 and user_id = $2 and revoked_at is null`,
    [input.appId, input.userId],
  );
}

export async function revokeAllOAuthTokensForUser(userId: number) {
  await query(
    `update oauth_access_tokens
        set revoked_at = now()
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
  await query(
    `update oauth_refresh_tokens
        set revoked_at = now()
      where user_id = $1 and revoked_at is null`,
    [userId],
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
  const row = await queryOne<TokenRow>(
    `update oauth_refresh_tokens
        set revoked_at = now()
      where token_hash = $1
        and external_app_id = $2
        and revoked_at is null
      returning id, external_app_id, user_id, scopes, expires_at::text, revoked_at::text`,
    [hashToken(token), appId],
  );
  return row ? mapToken(row) : null;
}

export type OAuthPushedRequest = {
  id: number;
  appId: number;
  scopes: string[];
  redirectUri: string;
  state: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  nonce: string | null;
  expiresAt: string;
};

export async function createPushedRequest(input: {
  requestUri: string;
  appId: number;
  scopes: string[];
  redirectUri: string;
  state: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  nonce: string | null;
  expiresAt: Date;
}) {
  await query(
    `insert into oauth_pushed_requests (
      request_uri_hash, external_app_id, scopes, redirect_uri, state, code_challenge, code_challenge_method, nonce, expires_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      hashToken(input.requestUri),
      input.appId,
      input.scopes,
      input.redirectUri,
      input.state,
      input.codeChallenge,
      input.codeChallengeMethod,
      input.nonce,
      input.expiresAt,
    ]
  );
}

export async function findPushedRequest(requestUri: string): Promise<OAuthPushedRequest | null> {
  const row = await queryOne<{
    id: string;
    external_app_id: string;
    scopes: string[];
    redirect_uri: string;
    state: string | null;
    code_challenge: string | null;
    code_challenge_method: string | null;
    nonce: string | null;
    expires_at: string;
  }>(
    `select id, external_app_id, scopes, redirect_uri, state, code_challenge, code_challenge_method, nonce, expires_at::text
     from oauth_pushed_requests
     where request_uri_hash = $1 and expires_at > now()`,
    [hashToken(requestUri)]
  );

  if (!row) return null;

  return {
    id: Number(row.id),
    appId: Number(row.external_app_id),
    scopes: row.scopes || [],
    redirectUri: row.redirect_uri,
    state: row.state,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: row.code_challenge_method,
    nonce: row.nonce,
    expiresAt: row.expires_at,
  };
}

export type OAuthDeviceCode = {
  id: number;
  appId: number;
  userId: number | null;
  scopes: string[];
  status: "pending" | "approved" | "denied" | "expired" | "consumed";
  pollIntervalSeconds: number;
  lastPolledAt: string | null;
  expiresAt: string;
};

export async function createDeviceCode(input: {
  deviceCode: string;
  userCode: string;
  appId: number;
  scopes: string[];
  pollIntervalSeconds: number;
  expiresAt: Date;
}) {
  await query(
    `insert into oauth_device_codes (
      device_code_hash, user_code_hash, external_app_id, scopes, poll_interval_seconds, expires_at
    ) values ($1, $2, $3, $4, $5, $6)`,
    [
      hashToken(input.deviceCode),
      hashToken(input.userCode),
      input.appId,
      input.scopes,
      input.pollIntervalSeconds,
      input.expiresAt,
    ]
  );
}

export async function findDeviceCodeByDeviceCode(deviceCode: string): Promise<OAuthDeviceCode | null> {
  const row = await queryOne<{
    id: string;
    external_app_id: string;
    user_id: string | null;
    scopes: string[];
    status: OAuthDeviceCode["status"];
    poll_interval_seconds: number;
    last_polled_at: string | null;
    expires_at: string;
  }>(
    `select id, external_app_id, user_id, scopes, status, poll_interval_seconds, last_polled_at::text, expires_at::text
     from oauth_device_codes
     where device_code_hash = $1`,
    [hashToken(deviceCode)]
  );

  if (!row) return null;

  return {
    id: Number(row.id),
    appId: Number(row.external_app_id),
    userId: row.user_id ? Number(row.user_id) : null,
    scopes: row.scopes || [],
    status: row.status,
    pollIntervalSeconds: row.poll_interval_seconds,
    lastPolledAt: row.last_polled_at,
    expiresAt: row.expires_at,
  };
}

export async function findDeviceCodeByUserCode(userCode: string): Promise<(OAuthDeviceCode & { appName: string }) | null> {
  const row = await queryOne<{
    id: string;
    external_app_id: string;
    user_id: string | null;
    scopes: string[];
    status: OAuthDeviceCode["status"];
    poll_interval_seconds: number;
    last_polled_at: string | null;
    expires_at: string;
    app_name: string;
  }>(
    `select d.id, d.external_app_id, d.user_id, d.scopes, d.status, d.poll_interval_seconds, d.last_polled_at::text, d.expires_at::text, a.name as app_name
     from oauth_device_codes d
     join external_apps a on d.external_app_id = a.id
     where d.user_code_hash = $1 and d.expires_at > now()`,
    [hashToken(userCode)]
  );

  if (!row) return null;

  return {
    id: Number(row.id),
    appId: Number(row.external_app_id),
    userId: row.user_id ? Number(row.user_id) : null,
    scopes: row.scopes || [],
    status: row.status,
    pollIntervalSeconds: row.poll_interval_seconds,
    lastPolledAt: row.last_polled_at,
    expiresAt: row.expires_at,
    appName: row.app_name,
  };
}

export async function updateDeviceCodeStatus(
  userCode: string,
  status: "approved" | "denied",
  userId: number
) {
  await query(
    `update oauth_device_codes
        set status = $2, user_id = $3
      where user_code_hash = $1
        and status = 'pending'
        and expires_at > now()`,
    [hashToken(userCode), status, userId]
  );
}

export async function markDeviceCodePolled(id: number) {
  await query(
    `update oauth_device_codes set last_polled_at = now() where id = $1`,
    [id],
  );
}

export async function consumeDeviceCode(id: number) {
  const row = await queryOne<{
    id: string;
    external_app_id: string;
    user_id: string | null;
    scopes: string[];
    status: OAuthDeviceCode["status"];
    poll_interval_seconds: number;
    last_polled_at: string | null;
    expires_at: string;
  }>(
    `update oauth_device_codes
        set status = 'consumed',
            consumed_at = now()
      where id = $1
        and status = 'approved'
        and expires_at > now()
      returning id, external_app_id, user_id, scopes, status, poll_interval_seconds, last_polled_at::text, expires_at::text`,
    [id],
  );

  return row
    ? {
        id: Number(row.id),
        appId: Number(row.external_app_id),
        userId: row.user_id ? Number(row.user_id) : null,
        scopes: row.scopes || [],
        status: row.status,
        pollIntervalSeconds: row.poll_interval_seconds,
        lastPolledAt: row.last_polled_at,
        expiresAt: row.expires_at,
      }
    : null;
}

// Records a client_assertion jti for replay protection. Returns true
// when the jti is newly recorded (caller may proceed), false when it
// was already in the table (replay — reject the assertion).
export async function recordClientAssertionJti(input: {
  appId: number;
  jti: string;
  expiresAt: Date;
}) {
  const row = await queryOne<{ id: string }>(
    `insert into oauth_client_assertion_jtis (external_app_id, jti, expires_at)
     values ($1, $2, $3)
     on conflict (external_app_id, jti) do nothing
     returning id`,
    [input.appId, input.jti, input.expiresAt.toISOString()],
  );
  return row !== null;
}

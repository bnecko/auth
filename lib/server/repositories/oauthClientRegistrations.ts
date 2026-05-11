import { query, queryOne } from "../db";
import { hashToken } from "../crypto";

export type OAuthClientRegistrationStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired";

export type OAuthClientRegistrationRequest = {
  id: number;
  publicId: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  scopes: string[];
  tokenEndpointAuthMethod: "client_secret_basic" | "client_secret_post" | "none";
  clientType: "public" | "confidential";
  oauthProfileVersion: string;
  status: OAuthClientRegistrationStatus;
  requesterIp: string | null;
  requesterUserAgent: string | null;
  requesterCountry: string | null;
  externalAppId: number | null;
  hasPlaintextClientSecret: boolean;
  clientSecretRevealedAt: string | null;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  createdAt: string;
  expiresAt: string;
};

type RegistrationRow = {
  id: string;
  public_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  scopes: string[];
  token_endpoint_auth_method: OAuthClientRegistrationRequest["tokenEndpointAuthMethod"];
  client_type: OAuthClientRegistrationRequest["clientType"];
  oauth_profile_version: string;
  status: OAuthClientRegistrationStatus;
  requester_ip: string | null;
  requester_user_agent: string | null;
  requester_country: string | null;
  external_app_id: string | null;
  plaintext_client_secret: string | null;
  client_secret_revealed_at: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  expires_at: string;
};

const registrationSelect = `
  id,
  public_id,
  client_name,
  redirect_uris,
  grant_types,
  scopes,
  token_endpoint_auth_method,
  client_type,
  oauth_profile_version,
  status,
  requester_ip,
  requester_user_agent,
  requester_country,
  external_app_id,
  plaintext_client_secret,
  client_secret_revealed_at::text,
  reviewed_by_user_id,
  reviewed_at::text,
  created_at::text,
  expires_at::text
`;

function mapRegistration(row: RegistrationRow): OAuthClientRegistrationRequest {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    clientName: row.client_name,
    redirectUris: row.redirect_uris || [],
    grantTypes: row.grant_types || [],
    scopes: row.scopes || [],
    tokenEndpointAuthMethod: row.token_endpoint_auth_method,
    clientType: row.client_type,
    oauthProfileVersion: row.oauth_profile_version,
    status: row.status,
    requesterIp: row.requester_ip,
    requesterUserAgent: row.requester_user_agent,
    requesterCountry: row.requester_country,
    externalAppId: row.external_app_id ? Number(row.external_app_id) : null,
    hasPlaintextClientSecret: Boolean(row.plaintext_client_secret),
    clientSecretRevealedAt: row.client_secret_revealed_at,
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function createOAuthClientRegistrationRequest(input: {
  publicId: string;
  registrationToken: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  scopes: string[];
  tokenEndpointAuthMethod: OAuthClientRegistrationRequest["tokenEndpointAuthMethod"];
  clientType: OAuthClientRegistrationRequest["clientType"];
  oauthProfileVersion: string;
  requesterIp: string;
  requesterUserAgent: string;
  requesterCountry: string;
  expiresAt: Date;
}) {
  const row = await queryOne<RegistrationRow>(
    `insert into oauth_client_registration_requests (
       public_id,
       registration_token_hash,
       client_name,
       redirect_uris,
       grant_types,
       scopes,
       token_endpoint_auth_method,
       client_type,
       oauth_profile_version,
       requester_ip,
       requester_user_agent,
       requester_country,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning ${registrationSelect}`,
    [
      input.publicId,
      hashToken(input.registrationToken),
      input.clientName,
      input.redirectUris,
      input.grantTypes,
      input.scopes,
      input.tokenEndpointAuthMethod,
      input.clientType,
      input.oauthProfileVersion,
      input.requesterIp,
      input.requesterUserAgent,
      input.requesterCountry,
      input.expiresAt.toISOString(),
    ],
  );

  if (!row) {
    throw new Error("failed to create oauth client registration request");
  }

  return mapRegistration(row);
}

export async function listPendingOAuthClientRegistrationRequests() {
  const rows = await query<RegistrationRow>(
    `select ${registrationSelect}
       from oauth_client_registration_requests
      where status = 'pending'
        and expires_at > now()
      order by created_at asc
      limit 100`,
  );
  return rows.map(mapRegistration);
}

export async function findOAuthClientRegistrationRequestById(id: number) {
  const row = await queryOne<RegistrationRow>(
    `select ${registrationSelect}
       from oauth_client_registration_requests
      where id = $1`,
    [id],
  );
  return row ? mapRegistration(row) : null;
}

export async function findOAuthClientRegistrationRequestForToken(
  publicId: string,
  registrationToken: string,
) {
  const row = await queryOne<RegistrationRow>(
    `select ${registrationSelect}
       from oauth_client_registration_requests
      where public_id = $1
        and registration_token_hash = $2
        and expires_at > now()`,
    [publicId, hashToken(registrationToken)],
  );
  return row ? mapRegistration(row) : null;
}

export async function approveOAuthClientRegistrationRequest(input: {
  id: number;
  publicId: string;
  slug: string;
  apiKey: string;
  clientSecret: string | null;
  reviewedByUserId: number;
}) {
  const row = await queryOne<RegistrationRow>(
    `with req as (
       select *
         from oauth_client_registration_requests
        where id = $1
          and status = 'pending'
          and expires_at > now()
        for update
     ), app as (
       insert into external_apps (
         public_id,
         name,
         slug,
         api_key_hash,
         oauth_client_secret_hash,
         allowed_redirect_urls,
         client_type,
         token_endpoint_auth_method,
         allowed_grant_types,
         allowed_scopes,
         issue_refresh_tokens,
         oauth_profile_version,
         status
       )
       select
         $2,
         client_name,
         $3,
         $4,
         $5,
         redirect_uris,
         client_type,
         token_endpoint_auth_method,
         grant_types,
         scopes,
         'refresh_token' = any(grant_types),
         oauth_profile_version,
         'active'
       from req
       returning id
     )
     update oauth_client_registration_requests r
        set status = 'approved',
            external_app_id = (select id from app),
            plaintext_client_secret = $6,
            reviewed_by_user_id = $7,
            reviewed_at = now()
      where r.id = $1
      returning ${registrationSelect}`,
    [
      input.id,
      input.publicId,
      input.slug,
      hashToken(input.apiKey),
      input.clientSecret ? hashToken(input.clientSecret) : null,
      input.clientSecret,
      input.reviewedByUserId,
    ],
  );
  return row ? mapRegistration(row) : null;
}

export async function denyOAuthClientRegistrationRequest(input: {
  id: number;
  reviewedByUserId: number;
}) {
  const row = await queryOne<RegistrationRow>(
    `update oauth_client_registration_requests
        set status = 'denied',
            reviewed_by_user_id = $2,
            reviewed_at = now()
      where id = $1
        and status = 'pending'
      returning ${registrationSelect}`,
    [input.id, input.reviewedByUserId],
  );
  return row ? mapRegistration(row) : null;
}

export async function revealOAuthClientRegistrationSecret(input: {
  publicId: string;
  registrationToken: string;
}) {
  const row = await queryOne<{ plaintext_client_secret: string | null }>(
    `update oauth_client_registration_requests
        set plaintext_client_secret = null,
            client_secret_revealed_at = now()
      where public_id = $1
        and registration_token_hash = $2
        and status = 'approved'
        and plaintext_client_secret is not null
      returning plaintext_client_secret`,
    [input.publicId, hashToken(input.registrationToken)],
  );
  return row?.plaintext_client_secret || null;
}

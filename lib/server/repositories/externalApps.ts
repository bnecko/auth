import { query, queryOne } from "../db";
import { hashToken } from "../crypto";
import type { ExternalApp } from "../types";

type ExternalAppRow = {
  id: string;
  public_id: string;
  name: string;
  slug: string;
  owner_user_id: string | null;
  callback_url: string | null;
  allowed_redirect_urls: string[];
  post_logout_redirect_urls: string[];
  client_type: ExternalApp["clientType"];
  token_endpoint_auth_method: ExternalApp["tokenEndpointAuthMethod"];
  allowed_grant_types: string[];
  allowed_scopes: string[];
  issue_refresh_tokens: boolean;
  oauth_profile_version: string;
  jwks_uri: string | null;
  jwks: Record<string, unknown> | null;
  required_product: string | null;
  status: "active" | "disabled";
};

function mapExternalApp(row: ExternalAppRow): ExternalApp {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    name: row.name,
    slug: row.slug,
    ownerUserId: row.owner_user_id ? Number(row.owner_user_id) : null,
    callbackUrl: row.callback_url,
    allowedRedirectUrls: row.allowed_redirect_urls || [],
    postLogoutRedirectUrls: row.post_logout_redirect_urls || [],
    clientType: row.client_type,
    tokenEndpointAuthMethod: row.token_endpoint_auth_method,
    allowedGrantTypes: row.allowed_grant_types || [],
    allowedScopes: row.allowed_scopes || [],
    issueRefreshTokens: row.issue_refresh_tokens,
    oauthProfileVersion: row.oauth_profile_version,
    jwksUri: row.jwks_uri,
    jwks: row.jwks,
    requiredProduct: row.required_product,
    status: row.status,
  };
}

const externalAppSelect = `
  id,
  public_id,
  name,
  slug,
  owner_user_id,
  callback_url,
  allowed_redirect_urls,
  post_logout_redirect_urls,
  client_type,
  token_endpoint_auth_method,
  allowed_grant_types,
  allowed_scopes,
  issue_refresh_tokens,
  oauth_profile_version,
  jwks_uri,
  jwks,
  required_product,
  status
`;

export async function findExternalAppByApiKey(apiKey: string) {
  const row = await queryOne<ExternalAppRow>(
    `select
       ${externalAppSelect}
     from external_apps
     where api_key_hash = $1`,
    [hashToken(apiKey)],
  );
  return row ? mapExternalApp(row) : null;
}

export async function findExternalAppByClientId(clientId: string) {
  const row = await queryOne<ExternalAppRow>(
    `select
       ${externalAppSelect}
     from external_apps
     where public_id = $1`,
    [clientId],
  );
  return row ? mapExternalApp(row) : null;
}

export async function findExternalAppBySlug(slug: string) {
  const row = await queryOne<ExternalAppRow>(
    `select
       ${externalAppSelect}
     from external_apps
     where slug = $1`,
    [slug],
  );
  return row ? mapExternalApp(row) : null;
}

export async function verifyExternalAppClientSecret(
  clientId: string,
  clientSecret: string,
) {
  const row = await queryOne<ExternalAppRow>(
    `select
       ${externalAppSelect}
     from external_apps
     where public_id = $1
       and (
         oauth_client_secret_hash = $2
         or exists (
           select 1
             from external_app_oauth_secrets s
            where s.external_app_id = external_apps.id
              and s.secret_hash = $2
              and s.revoked_at is null
              and (s.expires_at is null or s.expires_at > now())
         )
       )`,
    [clientId, hashToken(clientSecret)],
  );
  return row ? mapExternalApp(row) : null;
}

export async function rotateExternalAppOAuthSecret(input: {
  appId: number;
  currentSecretHash: string | null;
  newSecret: string;
  previousExpiresAt: Date;
}) {
  await queryOne<{ id: string }>(
    `update external_apps
        set oauth_client_secret_hash = $2,
            updated_at = now()
      where id = $1
      returning id`,
    [input.appId, hashToken(input.newSecret)],
  );

  if (input.currentSecretHash) {
    await queryOne<{ id: string }>(
      `insert into external_app_oauth_secrets (
         external_app_id,
         secret_hash,
         expires_at
       )
       values ($1, $2, $3)
       on conflict (secret_hash) do nothing
       returning id`,
      [
        input.appId,
        input.currentSecretHash,
        input.previousExpiresAt.toISOString(),
      ],
    );
  }
}

// Immediate cutover, no grace window: the api key rotation paths are
// owner-initiated compromise response, where the old key must stop
// authenticating the activation/bearer API at once.
export async function rotateExternalAppApiKey(appId: number, newApiKey: string) {
  await query(
    `update external_apps
        set api_key_hash = $2,
            updated_at = now()
      where id = $1`,
    [appId, hashToken(newApiKey)],
  );

  // A Telegram bearer approval stashes the plaintext key until the owner's
  // one-time reveal. Without this refresh, rotating before that reveal would
  // burn the reveal on the old, already-dead key.
  await query(
    `update bearer_requests
        set plaintext_key = $2
      where external_app_id = $1
        and plaintext_key is not null`,
    [appId, newApiKey],
  );
}

export async function createExternalApp(input: {
  publicId: string;
  name: string;
  slug: string;
  ownerUserId: number;
  apiKey: string;
}) {
  // Bearer/activation apps authenticate only via their api key. They are not
  // OAuth confidential clients (no redirect URIs, no client_credentials grant),
  // so oauth_client_secret_hash is left null rather than reusing the api-key
  // hash - the two surfaces must not share a secret.
  const row = await queryOne<ExternalAppRow>(
    `insert into external_apps (
       public_id,
       name,
       slug,
       owner_user_id,
       api_key_hash
     )
     values ($1, $2, $3, $4, $5)
     returning
       ${externalAppSelect}`,
    [
      input.publicId,
      input.name,
      input.slug,
      input.ownerUserId,
      hashToken(input.apiKey),
    ],
  );
  if (!row) {
    throw new Error("failed to create external app");
  }
  return mapExternalApp(row);
}

export async function countActiveExternalAppsForOwner(ownerUserId: number) {
  const row = await queryOne<{ count: string }>(
    `select count(*) as count
       from external_apps
      where owner_user_id = $1 and status = 'active'`,
    [ownerUserId],
  );
  return Number(row?.count || 0);
}

export async function listExternalAppsForAdmin() {
  // revoked_by_owner marks apps the owner permanently revoked through the
  // bearer flow; the admin panel must not offer to re-enable those.
  const rows = await query<{
    id: string;
    public_id: string;
    name: string;
    slug: string;
    status: "active" | "disabled";
    owner_username: string | null;
    revoked_by_owner: boolean;
    created_at: string;
  }>(
    `select a.id, a.public_id, a.name, a.slug, a.status,
            u.username as owner_username,
            exists (
              select 1 from bearer_requests br
               where br.external_app_id = a.id and br.status = 'revoked'
            ) as revoked_by_owner,
            a.created_at::text
       from external_apps a
       left join users u on u.id = a.owner_user_id
      order by a.created_at desc`,
  );
  return rows.map(row => ({
    id: Number(row.id),
    publicId: row.public_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    ownerUsername: row.owner_username,
    revokedByOwner: row.revoked_by_owner,
    createdAt: row.created_at,
  }));
}

export async function hasOwnerRevokedExternalApp(appId: number) {
  const row = await queryOne<{ exists: boolean }>(
    `select exists (
       select 1 from bearer_requests
        where external_app_id = $1 and status = 'revoked'
     ) as exists`,
    [appId],
  );
  return Boolean(row?.exists);
}

export async function findExternalAppById(id: number) {
  const row = await queryOne<ExternalAppRow>(
    `select
       ${externalAppSelect}
     from external_apps
     where id = $1`,
    [id],
  );
  return row ? mapExternalApp(row) : null;
}

export async function setExternalAppStatus(
  appId: number,
  status: "active" | "disabled",
) {
  await query(
    `update external_apps set status = $2, updated_at = now() where id = $1`,
    [appId, status],
  );
}

export async function findExternalAppSecretHashForOwner(
  appId: number,
  ownerUserId: number,
) {
  // api_key_shared_with_oauth also checks the grace table: a pre-split app
  // whose owner rotated the client secret before the api-key co-rotation
  // shipped has its shared hash parked in external_app_oauth_secrets while
  // api_key_hash still holds it, so equality with the current secret hash
  // alone would miss that cohort. Expiry is deliberately ignored: any
  // historic OAuth secret equal to the api key proves pre-split sharing.
  return queryOne<{
    slug: string;
    oauth_client_secret_hash: string | null;
    oauth_profile_version: string;
    api_key_shared_with_oauth: boolean;
  }>(
    `select slug,
            oauth_client_secret_hash,
            oauth_profile_version,
            (api_key_hash = oauth_client_secret_hash
              or exists (
                select 1
                  from external_app_oauth_secrets s
                 where s.external_app_id = external_apps.id
                   and s.secret_hash = api_key_hash
              )) as api_key_shared_with_oauth
       from external_apps
      where id = $1 and owner_user_id = $2`,
    [appId, ownerUserId],
  );
}

export async function updateExternalAppOAuthProfileVersion(input: {
  appId: number;
  ownerUserId: number;
  version: string;
}) {
  const row = await queryOne<{ slug: string }>(
    `update external_apps
        set oauth_profile_version = $3,
            updated_at = now()
      where id = $1 and owner_user_id = $2
      returning slug`,
    [input.appId, input.ownerUserId, input.version],
  );
  return row;
}

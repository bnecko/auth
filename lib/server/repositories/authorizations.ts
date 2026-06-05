import { query, queryOne } from "../db";

export type AppAuthorization = {
  appName: string;
  appSlug: string;
  scopes: string[];
  createdAt: string;
};

export async function upsertAuthorization(input: {
  userId: number;
  appId: number;
  scopes: string[];
}) {
  await query(
    `insert into app_authorizations (user_id, external_app_id, scopes)
     values ($1, $2, $3)
     on conflict (user_id, external_app_id)
     do update set scopes = excluded.scopes, revoked_at = null`,
    [input.userId, input.appId, input.scopes],
  );
}

export async function revokeAuthorization(userId: number, appId: number) {
  await query(
    `update app_authorizations set revoked_at = now() where user_id = $1 and external_app_id = $2`,
    [userId, appId]
  );
}

export async function revokeAuthorizationsForUser(userId: number) {
  await query(
    `update app_authorizations
        set revoked_at = now()
      where user_id = $1
        and revoked_at is null`,
    [userId],
  );
}

export async function listAuthorizationsForUser(userId: number) {
  const rows = await query<{
    app_name: string;
    app_slug: string;
    scopes: string[];
    created_at: string;
  }>(
    `select ea.name as app_name,
            ea.slug as app_slug,
            aa.scopes,
            aa.created_at::text
       from app_authorizations aa
       join external_apps ea on ea.id = aa.external_app_id
      where aa.user_id = $1
        and aa.revoked_at is null
      order by aa.created_at desc`,
    [userId],
  );

  return rows.map(row => ({
    appName: row.app_name,
    appSlug: row.app_slug,
    scopes: row.scopes || [],
    createdAt: row.created_at,
  }));
}

export async function countAuthorizations(userId: number) {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text
       from app_authorizations
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
  return Number(row?.count || 0);
}

export async function findAuthorization(userId: number, appId: number) {
  const row = await queryOne<{ scopes: string[] }>(
    `select scopes
       from app_authorizations
      where user_id = $1 and external_app_id = $2 and revoked_at is null`,
    [userId, appId],
  );
  return row ? { scopes: row.scopes || [] } : null;
}

// Like findAuthorization but distinguishes "never authorized" (null) from
// "authorized then revoked" (revoked: true), so the activation status endpoint
// can report a revoked grant instead of silently dropping the profile.
export async function findAuthorizationState(userId: number, appId: number) {
  const row = await queryOne<{ scopes: string[]; revoked_at: string | null }>(
    `select scopes, revoked_at::text
       from app_authorizations
      where user_id = $1 and external_app_id = $2`,
    [userId, appId],
  );
  if (!row) {
    return null;
  }
  return { scopes: row.scopes || [], revoked: row.revoked_at !== null };
}

// Authorizations granted to one app, for the integrator's GET /api/authorizations.
// Subject is the user's public id, never the internal row id.
export async function listAuthorizationsForApp(appId: number, limit = 200) {
  const rows = await query<{
    subject: string;
    scopes: string[];
    created_at: string;
  }>(
    `select u.public_id as subject,
            aa.scopes,
            aa.created_at::text
       from app_authorizations aa
       join users u on u.id = aa.user_id
      where aa.external_app_id = $1
        and aa.revoked_at is null
      order by aa.created_at desc
      limit $2`,
    [appId, limit],
  );
  return rows.map(row => ({
    subject: row.subject,
    scopes: row.scopes || [],
    createdAt: row.created_at,
  }));
}

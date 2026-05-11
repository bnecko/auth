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

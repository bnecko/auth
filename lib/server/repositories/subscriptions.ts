import { query, queryOne } from "../db";

export type Subscription = {
  product: string;
  status: "active" | "expired" | "revoked" | "trial";
  startsAt: string | null;
  expiresAt: string | null;
};

export async function hasActiveSubscription(userId: number, product: string) {
  const row = await queryOne<{ exists: boolean }>(
    `select exists(
       select 1
         from subscriptions
        where user_id = $1
          and product = $2
          and status in ('active', 'trial')
          and revoked_at is null
          and (expires_at is null or expires_at > $3)
     )`,
    [userId, product, new Date().toISOString()],
  );
  return row?.exists === true;
}

export async function listSubscriptionsForUser(userId: number) {
  const rows = await query<{
    product: string;
    status: Subscription["status"];
    starts_at: string | null;
    expires_at: string | null;
  }>(
    `select product, status, starts_at::text, expires_at::text
       from subscriptions
      where user_id = $1
      order by created_at desc`,
    [userId],
  );

  return rows.map(row => ({
    product: row.product,
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
  }));
}

export async function countActiveSubscriptions(userId: number) {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text
       from subscriptions
      where user_id = $1
        and status in ('active', 'trial')
        and revoked_at is null
        and (expires_at is null or expires_at > $2)`,
    [userId, new Date().toISOString()],
  );
  return Number(row?.count || 0);
}

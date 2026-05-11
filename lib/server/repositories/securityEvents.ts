import { query, queryOne } from "../db";
import type { RequestContext } from "../http";

export async function recordSecurityEvent(input: {
  userId?: number | null;
  eventType: string;
  result: string;
  context: RequestContext;
  metadata?: Record<string, unknown>;
}) {
  await query(
    `insert into security_events (
       user_id,
       event_type,
       result,
       ip,
       user_agent,
       country,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      input.userId || null,
      input.eventType,
      input.result,
      input.context.ip,
      input.context.userAgent,
      input.context.country,
      JSON.stringify(input.metadata || {}),
    ],
  );
}

export async function countRecentEventsByIp(
  ip: string,
  eventType: string,
  minutes: number,
) {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text
       from security_events
      where ip = $1
        and event_type = $2
        and created_at > now() - ($3::int * interval '1 minute')`,
    [ip, eventType, minutes],
  );
  return Number(row?.count || 0);
}

export async function recentEventsForUser(userId: number, limit = 20) {
  return query<{
    event_type: string;
    result: string;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
  }>(
    `select event_type, result, ip, user_agent, created_at::text
       from security_events
      where user_id = $1
      order by created_at desc
      limit $2`,
    [userId, limit],
  );
}

export type SecurityEventSearchFilters = {
  eventType?: string;
  result?: string;
  username?: string;
  ip?: string;
  limit?: number;
};

export async function searchSecurityEvents(filters: SecurityEventSearchFilters) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.eventType) {
    params.push(`%${filters.eventType}%`);
    where.push(`se.event_type ilike $${params.length}`);
  }
  if (filters.result) {
    params.push(filters.result);
    where.push(`se.result = $${params.length}`);
  }
  if (filters.username) {
    params.push(`%${filters.username}%`);
    where.push(`u.username ilike $${params.length}`);
  }
  if (filters.ip) {
    params.push(filters.ip);
    where.push(`se.ip = $${params.length}`);
  }

  const limit = Math.min(Math.max(filters.limit || 200, 1), 1000);
  params.push(limit);

  return query<{
    event_type: string;
    result: string;
    ip: string | null;
    user_agent: string | null;
    country: string | null;
    metadata: Record<string, unknown>;
    username: string | null;
    created_at: string;
  }>(
    `select
       se.event_type,
       se.result,
       se.ip,
       se.user_agent,
       se.country,
       se.metadata,
       u.username,
       se.created_at::text
     from security_events se
     left join users u on u.id = se.user_id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by se.created_at desc
     limit $${params.length}`,
    params,
  );
}

export async function countRecentEventsForUser(
  userId: number,
  eventType: string,
  minutes: number,
) {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text
       from security_events
      where user_id = $1
        and event_type = $2
        and created_at > now() - ($3::int * interval '1 minute')`,
    [userId, eventType, minutes],
  );
  return Number(row?.count || 0);
}

export async function recentCountriesForUser(userId: number, limit = 5) {
  const rows = await query<{ country: string }>(
    `select distinct country
       from security_events
      where user_id = $1
        and country is not null
        and country <> ''
      order by country asc
      limit $2`,
    [userId, limit],
  );
  return rows.map(row => row.country);
}

export async function recentUserAgentsForUser(userId: number, limit = 20) {
  const rows = await query<{ user_agent: string }>(
    `select distinct user_agent
       from security_events
      where user_id = $1
        and user_agent is not null
        and user_agent <> ''
      order by user_agent asc
      limit $2`,
    [userId, limit],
  );
  return rows.map(row => row.user_agent);
}

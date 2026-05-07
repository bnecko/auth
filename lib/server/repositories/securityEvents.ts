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

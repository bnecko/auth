import { query, queryOne } from "../db";
import { hashToken } from "../crypto";

export type WebhookEndpoint = {
  id: number;
  publicId: string;
  appId: number;
  url: string;
  eventTypes: string[];
  status: "active" | "disabled";
  createdAt: string;
};

type EndpointRow = {
  id: string;
  public_id: string;
  external_app_id: string;
  url: string;
  event_types: string[];
  status: WebhookEndpoint["status"];
  created_at: string;
};

function mapEndpoint(row: EndpointRow): WebhookEndpoint {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    appId: Number(row.external_app_id),
    url: row.url,
    eventTypes: row.event_types || [],
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function createWebhookEndpoint(input: {
  publicId: string;
  appId: number;
  url: string;
  eventTypes: string[];
  secret: string;
}) {
  const row = await queryOne<EndpointRow>(
    `insert into webhook_endpoints (
       public_id,
       external_app_id,
       url,
       event_types,
       secret_hash
     )
     values ($1, $2, $3, $4, $5)
     returning id, public_id, external_app_id, url, event_types, status, created_at::text`,
    [
      input.publicId,
      input.appId,
      input.url,
      input.eventTypes,
      hashToken(input.secret),
    ],
  );
  if (!row) {
    throw new Error("failed to create webhook endpoint");
  }
  return mapEndpoint(row);
}

export async function listActiveWebhookEndpointsForApp(appId: number) {
  const rows = await query<EndpointRow>(
    `select id, public_id, external_app_id, url, event_types, status, created_at::text
       from webhook_endpoints
      where external_app_id = $1
        and status = 'active'
      order by created_at desc`,
    [appId],
  );
  return rows.map(mapEndpoint);
}

export async function createWebhookDelivery(input: {
  publicId: string;
  endpointId: number;
  eventType: string;
  payload: Record<string, unknown>;
  nextAttemptAt: Date;
}) {
  await query(
    `insert into webhook_deliveries (
       public_id,
       webhook_endpoint_id,
       event_type,
       payload,
       next_attempt_at
     )
     values ($1, $2, $3, $4::jsonb, $5)`,
    [
      input.publicId,
      input.endpointId,
      input.eventType,
      JSON.stringify(input.payload),
      input.nextAttemptAt.toISOString(),
    ],
  );
}

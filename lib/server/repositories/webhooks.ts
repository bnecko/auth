import { query, queryOne } from "../db";

export type WebhookEndpoint = {
  id: number;
  publicId: string;
  appId: number;
  url: string;
  eventTypes: string[];
  status: "active" | "disabled";
  createdAt: string;
};

export type WebhookDeliveryStatus =
  | "pending"
  | "delivered"
  | "failed"
  | "cancelled";

export type WebhookDelivery = {
  id: number;
  publicId: string;
  endpointId: number;
  eventType: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
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

type DeliveryRow = {
  id: string;
  public_id: string;
  webhook_endpoint_id: string;
  event_type: string;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  response_status: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
};

const endpointSelect = `id, public_id, external_app_id, url, event_types, status, created_at::text`;

const deliverySelect = `
  id,
  public_id,
  webhook_endpoint_id,
  event_type,
  status,
  attempt_count,
  next_attempt_at::text,
  response_status,
  last_error,
  created_at::text,
  delivered_at::text
`;

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

function mapDelivery(row: DeliveryRow): WebhookDelivery {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    endpointId: Number(row.webhook_endpoint_id),
    eventType: row.event_type,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    responseStatus: row.response_status,
    lastError: row.last_error,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
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
       secret
     )
     values ($1, $2, $3, $4, $5)
     returning ${endpointSelect}`,
    [
      input.publicId,
      input.appId,
      input.url,
      input.eventTypes,
      input.secret,
    ],
  );
  if (!row) {
    throw new Error("failed to create webhook endpoint");
  }
  return mapEndpoint(row);
}

export async function listActiveWebhookEndpointsForApp(appId: number) {
  const rows = await query<EndpointRow>(
    `select ${endpointSelect}
       from webhook_endpoints
      where external_app_id = $1
        and status = 'active'
      order by created_at desc`,
    [appId],
  );
  return rows.map(mapEndpoint);
}

export async function listWebhookEndpointsForApp(appId: number) {
  const rows = await query<EndpointRow>(
    `select ${endpointSelect}
       from webhook_endpoints
      where external_app_id = $1
      order by created_at desc`,
    [appId],
  );
  return rows.map(mapEndpoint);
}

export async function findWebhookEndpointByPublicId(publicId: string) {
  const row = await queryOne<EndpointRow>(
    `select ${endpointSelect}
       from webhook_endpoints
      where public_id = $1`,
    [publicId],
  );
  return row ? mapEndpoint(row) : null;
}

export async function disableWebhookEndpoint(publicId: string, appId: number) {
  const row = await queryOne<EndpointRow>(
    `update webhook_endpoints
        set status = 'disabled',
            disabled_at = now(),
            updated_at = now()
      where public_id = $1
        and external_app_id = $2
        and status = 'active'
      returning ${endpointSelect}`,
    [publicId, appId],
  );
  return row ? mapEndpoint(row) : null;
}

export async function deleteWebhookEndpoint(publicId: string, appId: number) {
  const row = await queryOne<{ id: string }>(
    `delete from webhook_endpoints
      where public_id = $1
        and external_app_id = $2
      returning id`,
    [publicId, appId],
  );
  return row !== null;
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

export async function findWebhookDeliveryByPublicId(publicId: string) {
  const row = await queryOne<DeliveryRow>(
    `select ${deliverySelect}
       from webhook_deliveries
      where public_id = $1`,
    [publicId],
  );
  return row ? mapDelivery(row) : null;
}

export type WebhookDeliveryRowForAdmin = WebhookDelivery & {
  endpointUrl: string;
  endpointStatus: WebhookEndpoint["status"];
  appPublicId: string;
  appName: string;
  appSlug: string;
};

type AdminDeliveryRow = DeliveryRow & {
  endpoint_url: string;
  endpoint_status: WebhookEndpoint["status"];
  app_public_id: string;
  app_name: string;
  app_slug: string;
};

export async function listRecentWebhookDeliveries(input: {
  limit: number;
  status?: WebhookDeliveryStatus;
}) {
  const rows = await query<AdminDeliveryRow>(
    `select
       d.id, d.public_id, d.webhook_endpoint_id, d.event_type, d.status,
       d.attempt_count, d.next_attempt_at::text, d.response_status,
       d.last_error, d.created_at::text, d.delivered_at::text,
       e.url as endpoint_url, e.status as endpoint_status,
       a.public_id as app_public_id, a.name as app_name, a.slug as app_slug
       from webhook_deliveries d
       join webhook_endpoints e on e.id = d.webhook_endpoint_id
       join external_apps a on a.id = e.external_app_id
      where ($2::text is null or d.status = $2)
      order by d.created_at desc
      limit $1`,
    [input.limit, input.status || null],
  );
  return rows.map(row => ({
    ...mapDelivery(row),
    endpointUrl: row.endpoint_url,
    endpointStatus: row.endpoint_status,
    appPublicId: row.app_public_id,
    appName: row.app_name,
    appSlug: row.app_slug,
  }));
}

export async function retryWebhookDelivery(publicId: string) {
  const row = await queryOne<DeliveryRow>(
    `update webhook_deliveries
        set status = 'pending',
            next_attempt_at = now(),
            last_error = null
      where public_id = $1
        and status in ('failed', 'pending')
      returning ${deliverySelect}`,
    [publicId],
  );
  return row ? mapDelivery(row) : null;
}

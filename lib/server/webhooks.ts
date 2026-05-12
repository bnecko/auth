import { createHmac } from "crypto";
import { publicId, randomToken } from "./crypto";
import {
  createWebhookDelivery,
  createWebhookEndpoint,
  listActiveWebhookEndpointsForApp,
} from "./repositories/webhooks";

export const webhookEventTypes = [
  "user.created",
  "oauth.grant.created",
  "token.revoked",
  "subscription.changed",
  "activation.approved",
  "activation.denied",
  "activation.cancelled",
] as const;

export type WebhookEventType = (typeof webhookEventTypes)[number];

export function createWebhookSecret() {
  return `whsec_${randomToken(32)}`;
}

export function signWebhookPayload(input: {
  secret: string;
  timestamp: number;
  body: string;
}) {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest("hex");
}

export async function registerWebhookEndpoint(input: {
  appId: number;
  url: string;
  eventTypes: string[];
}) {
  const secret = createWebhookSecret();
  const endpoint = await createWebhookEndpoint({
    publicId: publicId("wh"),
    appId: input.appId,
    url: input.url,
    eventTypes: input.eventTypes,
    secret,
  });
  return { endpoint, secret };
}

export async function enqueueWebhookEvent(input: {
  appId: number;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const endpoints = await listActiveWebhookEndpointsForApp(input.appId);
  await Promise.all(
    endpoints
      .filter(endpoint => endpoint.eventTypes.includes(input.eventType))
      .map(endpoint => createWebhookDelivery({
        publicId: publicId("whd"),
        endpointId: endpoint.id,
        eventType: input.eventType,
        payload: input.payload,
        nextAttemptAt: new Date(),
      })),
  );
}

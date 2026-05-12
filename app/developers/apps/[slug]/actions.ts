"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentSession } from "@/lib/server/session";
import { query, queryOne } from "@/lib/server/db";
import { randomToken } from "@/lib/server/crypto";
import { requestContextFromHeaders } from "@/lib/server/http";
import {
  findExternalAppSecretHashForOwner,
  rotateExternalAppOAuthSecret,
  updateExternalAppOAuthProfileVersion,
} from "@/lib/server/repositories/externalApps";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { supportedOAuthProfileVersion } from "@/lib/server/config";
import {
  registerWebhookEndpoint,
  webhookEventTypes,
  type WebhookEventType,
} from "@/lib/server/webhooks";
import {
  deleteWebhookEndpoint,
  disableWebhookEndpoint,
  findWebhookEndpointByPublicId,
} from "@/lib/server/repositories/webhooks";

export async function updateAppAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current) {
    throw new Error("Unauthorized");
  }

  const appId = parseInt(formData.get("app_id")?.toString() || "0", 10);
  if (!appId) throw new Error("Invalid app ID");

  const app = await findExternalAppSecretHashForOwner(appId, current.user.id);

  if (!app) {
    throw new Error("App not found or unauthorized");
  }

  const action = formData.get("action")?.toString();

  if (action === "rotate_secret") {
    const newSecret = `sec_${randomToken(32)}`;
    await rotateExternalAppOAuthSecret({
      appId,
      currentSecretHash: app.oauth_client_secret_hash,
      newSecret,
      previousExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await recordSecurityEvent({
      userId: current.user.id,
      eventType: "oauth_client_secret",
      result: "rotated",
      context: requestContextFromHeaders(await headers()),
      metadata: { appId, appSlug: app.slug },
    });
    revalidatePath(`/developers/apps/${app.slug}`);
    return { clientSecret: newSecret };
  }

  if (action === "update_oauth_version") {
    const version = String(formData.get("oauth_profile_version") || "");
    if (!supportedOAuthProfileVersion(version)) {
      throw new Error("Unsupported OAuth profile version");
    }

    await updateExternalAppOAuthProfileVersion({
      appId,
      ownerUserId: current.user.id,
      version,
    });
    await recordSecurityEvent({
      userId: current.user.id,
      eventType: "oauth_client_profile_version",
      result: "updated",
      context: requestContextFromHeaders(await headers()),
      metadata: {
        appId,
        appSlug: app.slug,
        previousVersion: app.oauth_profile_version,
        version,
      },
    });
    revalidatePath(`/developers/apps/${app.slug}`);
    return { ok: true };
  }

  const urisRaw = formData.get("redirect_uris")?.toString() || "";
  const redirectUris = urisRaw.split("\n").map(u => u.trim()).filter(Boolean);

  for (const uri of redirectUris) {
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
        throw new Error("Redirect URI must be HTTPS unless using localhost.");
      }
    } catch {
      throw new Error(`Invalid Redirect URI format: ${uri}`);
    }
  }

  await query(
    `update external_apps set allowed_redirect_urls = $1, updated_at = now() where id = $2`,
    [redirectUris, appId]
  );
  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "oauth_client_redirects",
    result: "updated",
    context: requestContextFromHeaders(await headers()),
    metadata: { appId, appSlug: app.slug, redirectCount: redirectUris.length },
  });

  revalidatePath(`/developers/apps/${app.slug}`);
  return { ok: true };
}

async function assertOwnsApp(appId: number) {
  const current = await getCurrentSession();
  if (!current) {
    throw new Error("Unauthorized");
  }
  const owned = await queryOne<{ id: string; slug: string }>(
    `select id, slug from external_apps where id = $1 and owner_user_id = $2`,
    [appId, current.user.id],
  );
  if (!owned) {
    throw new Error("App not found or unauthorized");
  }
  return { userId: current.user.id, slug: owned.slug };
}

export async function createWebhookEndpointAction(formData: FormData) {
  const appId = parseInt(formData.get("app_id")?.toString() || "0", 10);
  if (!appId) throw new Error("Invalid app ID");
  const { userId, slug } = await assertOwnsApp(appId);

  const url = String(formData.get("url") || "").trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Webhook URL is not a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Webhook URL must be HTTPS unless using localhost.");
  }

  const requested = formData.getAll("event_types").map(String);
  const allowed = new Set<string>(webhookEventTypes);
  const eventTypes = requested.filter(t => allowed.has(t)) as WebhookEventType[];
  if (eventTypes.length === 0) {
    throw new Error("Select at least one event type.");
  }

  const { endpoint, secret } = await registerWebhookEndpoint({
    appId,
    url,
    eventTypes,
  });

  await recordSecurityEvent({
    userId,
    eventType: "webhook_endpoint_registered",
    result: "ok",
    context: requestContextFromHeaders(await headers()),
    metadata: { appId, endpointId: endpoint.publicId, eventTypes },
  });

  revalidatePath(`/developers/apps/${slug}`);
  return { endpoint, secret };
}

export async function disableWebhookEndpointAction(formData: FormData) {
  const appId = parseInt(formData.get("app_id")?.toString() || "0", 10);
  const endpointPublicId = String(formData.get("endpoint_id") || "");
  if (!appId || !endpointPublicId) throw new Error("Invalid arguments");
  const { userId, slug } = await assertOwnsApp(appId);

  const existing = await findWebhookEndpointByPublicId(endpointPublicId);
  if (!existing || existing.appId !== appId) {
    throw new Error("Endpoint not found");
  }

  await disableWebhookEndpoint(endpointPublicId, appId);
  await recordSecurityEvent({
    userId,
    eventType: "webhook_endpoint_disabled",
    result: "ok",
    context: requestContextFromHeaders(await headers()),
    metadata: { appId, endpointId: endpointPublicId },
  });
  revalidatePath(`/developers/apps/${slug}`);
}

export async function deleteWebhookEndpointAction(formData: FormData) {
  const appId = parseInt(formData.get("app_id")?.toString() || "0", 10);
  const endpointPublicId = String(formData.get("endpoint_id") || "");
  if (!appId || !endpointPublicId) throw new Error("Invalid arguments");
  const { userId, slug } = await assertOwnsApp(appId);

  const ok = await deleteWebhookEndpoint(endpointPublicId, appId);
  if (ok) {
    await recordSecurityEvent({
      userId,
      eventType: "webhook_endpoint_deleted",
      result: "ok",
      context: requestContextFromHeaders(await headers()),
      metadata: { appId, endpointId: endpointPublicId },
    });
  }
  revalidatePath(`/developers/apps/${slug}`);
}

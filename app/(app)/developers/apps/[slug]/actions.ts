"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentSession, assertNotRestricted } from "@/lib/server/session";
import { queryOne } from "@/lib/server/db";
import { randomToken } from "@/lib/server/crypto";
import { requestContextFromHeaders } from "@/lib/server/http";
import {
  deleteExternalAppForOwner,
  findExternalAppSecretHashForOwner,
  rotateExternalAppApiKey,
  rotateExternalAppOAuthSecret,
  setExternalAppFrozenForOwner,
  updateExternalAppDetailsForOwner,
  updateExternalAppOAuthProfileVersion,
  updateExternalAppPermissionsForOwner,
} from "@/lib/server/repositories/externalApps";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { supportedOAuthProfileVersion } from "@/lib/server/config";
import { OAUTH_GRANT_TYPES, OAUTH_SCOPE_LIST } from "@/lib/server/services/oauth";
import {
  registerWebhookEndpoint,
  rotateWebhookEndpointSecret,
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
  assertNotRestricted(current);

  const appId = parseInt(formData.get("app_id")?.toString() || "0", 10);
  if (!appId) throw new Error("Invalid app ID");

  const app = await findExternalAppSecretHashForOwner(appId, current.user.id);

  if (!app) {
    throw new Error("App not found or unauthorized");
  }

  const action = formData.get("action")?.toString();

  if (action === "rotate_secret") {
    // Apps created before the api-key/client-secret split share one secret
    // across both surfaces, so rotating the client secret alone would leave
    // the outgoing secret valid as an api key indefinitely. Rotate the api
    // key first: if the sequence fails midway, the shared state is intact
    // and a retry still co-rotates. The OAuth side keeps its usual 7-day
    // grace; the api key cuts over immediately.
    let newApiKey: string | undefined;
    if (app.api_key_shared_with_oauth) {
      newApiKey = `sec_${randomToken(32)}`;
      await rotateExternalAppApiKey(appId, newApiKey);
      await recordSecurityEvent({
        userId: current.user.id,
        eventType: "app_api_key",
        result: "rotated",
        context: requestContextFromHeaders(await headers()),
        metadata: { appId, appSlug: app.slug, reason: "shared_with_oauth_secret" },
      });
    }

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
    return { clientSecret: newSecret, apiKey: newApiKey };
  }

  if (action === "rotate_api_key") {
    // Mirror of the rotate_secret co-rotation: on a pre-split shared
    // credential, rotating only the api key would leave the outgoing value
    // alive as the OAuth client secret, so it must die on that surface too
    // (with the usual grace window). The conditional surface rotates first:
    // if the sequence fails midway, the shared hash is parked in the grace
    // table, the sharing stays detectable, and a retry completes both.
    let newSecret: string | undefined;
    if (app.api_key_shared_with_oauth) {
      newSecret = `sec_${randomToken(32)}`;
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
        metadata: { appId, appSlug: app.slug, reason: "shared_with_api_key" },
      });
    }

    const newApiKey = `sec_${randomToken(32)}`;
    await rotateExternalAppApiKey(appId, newApiKey);
    await recordSecurityEvent({
      userId: current.user.id,
      eventType: "app_api_key",
      result: "rotated",
      context: requestContextFromHeaders(await headers()),
      metadata: { appId, appSlug: app.slug },
    });

    revalidatePath(`/developers/apps/${app.slug}`);
    return { apiKey: newApiKey, clientSecret: newSecret };
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

  if (action === "update_permissions") {
    const scopes = formData.getAll("scopes").map(String);
    const grantTypes = formData.getAll("grant_types").map(String);
    const knownScopes = new Set<string>(OAUTH_SCOPE_LIST);
    const knownGrants = new Set<string>(OAUTH_GRANT_TYPES);
    if (scopes.length === 0 || scopes.some(s => !knownScopes.has(s))) {
      throw new Error("Select at least one valid scope.");
    }
    if (grantTypes.length === 0 || grantTypes.some(g => !knownGrants.has(g))) {
      throw new Error("Select at least one valid grant type.");
    }
    const issueRefreshTokens = formData.get("issue_refresh_tokens") === "on";

    await updateExternalAppPermissionsForOwner({
      appId,
      ownerUserId: current.user.id,
      allowedScopes: scopes,
      allowedGrantTypes: grantTypes,
      issueRefreshTokens,
    });
    await recordSecurityEvent({
      userId: current.user.id,
      eventType: "oauth_client_permissions",
      result: "updated",
      context: requestContextFromHeaders(await headers()),
      metadata: { appId, appSlug: app.slug, scopes, grantTypes, issueRefreshTokens },
    });
    revalidatePath(`/developers/apps/${app.slug}`);
    return { ok: true };
  }

  const name = formData.get("name")?.toString().trim() || "";
  if (!name || name.length > 50) {
    throw new Error("Name must be between 1 and 50 characters.");
  }
  const redirectUris = parseUriList(formData.get("redirect_uris"), "Redirect URI");
  const postLogoutUris = parseUriList(
    formData.get("post_logout_redirect_uris"),
    "Post-logout redirect URI",
  );

  await updateExternalAppDetailsForOwner({
    appId,
    ownerUserId: current.user.id,
    name,
    allowedRedirectUrls: redirectUris,
    postLogoutRedirectUrls: postLogoutUris,
  });
  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "oauth_client_settings",
    result: "updated",
    context: requestContextFromHeaders(await headers()),
    metadata: {
      appId,
      appSlug: app.slug,
      redirectCount: redirectUris.length,
      postLogoutCount: postLogoutUris.length,
    },
  });

  revalidatePath(`/developers/apps/${app.slug}`);
  return { ok: true };
}

function parseUriList(raw: FormDataEntryValue | null, label: string) {
  const uris = (raw?.toString() || "").split("\n").map(u => u.trim()).filter(Boolean);
  for (const uri of uris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error(`Invalid ${label} format: ${uri}`);
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error(`${label} must be HTTPS unless using localhost.`);
    }
  }
  return uris;
}

async function assertOwnsApp(appId: number) {
  const current = await getCurrentSession();
  if (!current) {
    throw new Error("Unauthorized");
  }
  assertNotRestricted(current);
  const owned = await queryOne<{ id: string; slug: string; public_id: string }>(
    `select id, slug, public_id from external_apps where id = $1 and owner_user_id = $2`,
    [appId, current.user.id],
  );
  if (!owned) {
    throw new Error("App not found or unauthorized");
  }
  return { userId: current.user.id, slug: owned.slug, publicId: owned.public_id };
}

export async function setAppFrozenAction(formData: FormData) {
  const appId = parseInt(formData.get("app_id")?.toString() || "0", 10);
  if (!appId) throw new Error("Invalid app ID");
  const { userId, slug } = await assertOwnsApp(appId);

  const frozen = formData.get("frozen")?.toString() === "1";
  const updated = await setExternalAppFrozenForOwner({
    appId,
    ownerUserId: userId,
    frozen,
  });
  if (!updated) {
    // The guarded transition found the app in a state the owner cannot
    // change: an admin disabled it, or another tab already flipped it.
    throw new Error(
      frozen ? "The app could not be frozen." : "The app could not be unfrozen. An app disabled by an admin stays disabled.",
    );
  }

  await recordSecurityEvent({
    userId,
    eventType: "oauth_client_status",
    result: frozen ? "frozen" : "active",
    context: requestContextFromHeaders(await headers()),
    metadata: { appId, appSlug: slug },
  });
  revalidatePath(`/developers/apps/${slug}`);
  revalidatePath("/developers/apps");
  return { ok: true };
}

export async function deleteAppAction(formData: FormData) {
  const appId = parseInt(formData.get("app_id")?.toString() || "0", 10);
  if (!appId) throw new Error("Invalid app ID");
  const { userId, slug, publicId } = await assertOwnsApp(appId);

  const confirm = formData.get("confirm")?.toString().trim() || "";
  if (confirm !== slug) {
    throw new Error(`Type the app slug (${slug}) to confirm deletion.`);
  }

  const deleted = await deleteExternalAppForOwner(appId, userId);
  if (!deleted) {
    throw new Error("App not found or unauthorized");
  }

  await recordSecurityEvent({
    userId,
    eventType: "oauth_client_deleted",
    result: "ok",
    context: requestContextFromHeaders(await headers()),
    metadata: { appId, appSlug: slug, clientId: publicId },
  });
  revalidatePath("/developers/apps");
  redirect("/developers/apps");
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

export async function rotateWebhookSecretAction(formData: FormData) {
  const appId = parseInt(formData.get("app_id")?.toString() || "0", 10);
  const endpointPublicId = String(formData.get("endpoint_id") || "");
  if (!appId || !endpointPublicId) throw new Error("Invalid arguments");
  const { userId, slug } = await assertOwnsApp(appId);

  const result = await rotateWebhookEndpointSecret(endpointPublicId, appId);
  if (!result) {
    throw new Error("Endpoint not found");
  }

  await recordSecurityEvent({
    userId,
    eventType: "webhook_secret_rotated",
    result: "ok",
    context: requestContextFromHeaders(await headers()),
    metadata: { appId, endpointId: endpointPublicId },
  });
  revalidatePath(`/developers/apps/${slug}`);
  return { secret: result.secret };
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

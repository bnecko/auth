"use server";

import { headers } from "next/headers";
import { getCurrentSession, assertNotRestricted } from "@/lib/server/session";
import { queryOne } from "@/lib/server/db";
import { hashToken, randomToken } from "@/lib/server/crypto";
import { requestContextFromHeaders } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { countActiveExternalAppsForOwner } from "@/lib/server/repositories/externalApps";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

const MAX_ACTIVE_APPS_PER_USER = 10;

export async function createAppAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current) {
    return { error: "unauthorized" };
  }
  assertNotRestricted(current);

  // Creation hands out live credentials (including the activation API key)
  // with no admin review, so it needs its own abuse controls: a verified
  // email, a per-user volume limit, and a cap on live apps.
  if (!current.user.emailVerifiedAt) {
    return { error: "Verify your email address before creating an application." };
  }

  const rl = await rateLimit(`rl:app:create:user:${current.user.id}`, 5, 60 * 60_000);
  if (!rl.success) {
    return { error: "Too many applications created recently. Try again later." };
  }

  const activeApps = await countActiveExternalAppsForOwner(current.user.id);
  if (activeApps >= MAX_ACTIVE_APPS_PER_USER) {
    return { error: `You can have at most ${MAX_ACTIVE_APPS_PER_USER} active applications.` };
  }

  const name = formData.get("name")?.toString().trim();
  const redirectUri = formData.get("redirect_uri")?.toString().trim();

  if (!name || name.length > 50) {
    return { error: "Name must be between 1 and 50 characters." };
  }

  if (!redirectUri) {
    return { error: "Redirect URI is required." };
  }

  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      return { error: "Redirect URI must be HTTPS unless using localhost." };
    }
  } catch {
    return { error: "Invalid Redirect URI format." };
  }

  const clientId = `app_${randomToken(16)}`;
  const clientSecret = `sec_${randomToken(32)}`;
  // The api key (activation/bearer API) and the OAuth client secret guard
  // different surfaces, so they are independent secrets - leaking one must not
  // authenticate the other.
  const apiKey = `sec_${randomToken(32)}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + randomToken(4);

  const row = await queryOne<{ id: string }>(
    `insert into external_apps (
      public_id,
      name,
      slug,
      api_key_hash,
      oauth_client_secret_hash,
      allowed_redirect_urls,
      client_type,
      token_endpoint_auth_method,
      allowed_grant_types,
      allowed_scopes,
      issue_refresh_tokens,
      oauth_profile_version,
      status,
      owner_user_id
    ) values ($1, $2, $3, $4, $5, $6, 'confidential', 'client_secret_post', $7, $8, true, 'bn-oauth-2026-05', 'active', $9) returning id`,
    [
      clientId,
      name,
      slug,
      hashToken(apiKey),
      hashToken(clientSecret),
      [redirectUri],
      ["authorization_code", "refresh_token", "client_credentials", "urn:ietf:params:oauth:grant-type:device_code"],
      ["openid", "profile", "email", "birthdate", "profile:read", "email:read", "dob:read", "subscription:read"],
      current.user.id,
    ]
  );

  if (!row) {
    return { error: "Failed to create application." };
  }

  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "oauth_client_created",
    result: "ok",
    context: requestContextFromHeaders(await headers()),
    metadata: { appId: Number(row.id), appSlug: slug, clientId },
  });

  return {
    app: {
      name,
      slug,
      clientId,
      clientSecret,
      apiKey,
    }
  };
}

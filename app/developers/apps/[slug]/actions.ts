"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentSession } from "@/lib/server/session";
import { query } from "@/lib/server/db";
import { randomToken } from "@/lib/server/crypto";
import { requestContextFromHeaders } from "@/lib/server/http";
import {
  findExternalAppSecretHashForOwner,
  rotateExternalAppOAuthSecret,
} from "@/lib/server/repositories/externalApps";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

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

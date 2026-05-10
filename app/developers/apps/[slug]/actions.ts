"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/server/session";
import { query, queryOne } from "@/lib/server/db";
import { hashToken, randomToken } from "@/lib/server/crypto";

export async function updateAppAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current) {
    throw new Error("Unauthorized");
  }

  const appId = parseInt(formData.get("app_id")?.toString() || "0", 10);
  if (!appId) throw new Error("Invalid app ID");

  const app = await queryOne<{ slug: string }>(
    `select slug from external_apps where id = $1 and owner_user_id = $2`,
    [appId, current.user.id]
  );

  if (!app) {
    throw new Error("App not found or unauthorized");
  }

  const action = formData.get("action")?.toString();

  if (action === "rotate_secret") {
    const newSecret = `sec_${randomToken(32)}`;
    await query(
      `update external_apps set api_key_hash = $1, updated_at = now() where id = $2`,
      [hashToken(newSecret), appId]
    );
    revalidatePath(`/developers/apps/${app.slug}`);
    return;
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

  revalidatePath(`/developers/apps/${app.slug}`);
}

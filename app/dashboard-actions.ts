"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/server/session";
import { revokeSessionById } from "@/lib/server/repositories/sessions";
import { revokeAuthorization } from "@/lib/server/repositories/authorizations";
import { revokeAccessTokensForRefreshGrant } from "@/lib/server/repositories/oauth";
import { findExternalAppBySlug } from "@/lib/server/repositories/externalApps";
import { cancelSubscription } from "@/lib/server/repositories/subscriptions";

export async function revokeSessionAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current) return;

  const sessionIdStr = formData.get("sessionId");
  if (typeof sessionIdStr !== "string") return;
  const sessionId = parseInt(sessionIdStr, 10);
  if (isNaN(sessionId)) return;

  await revokeSessionById(sessionId, current.user.id);
  revalidatePath("/");
}

export async function revokeAppAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current) return;

  const appSlug = formData.get("appSlug");
  if (typeof appSlug !== "string") return;

  const app = await findExternalAppBySlug(appSlug);
  if (!app) return;

  await revokeAuthorization(current.user.id, app.id);
  await revokeAccessTokensForRefreshGrant({ appId: app.id, userId: current.user.id });
  revalidatePath("/");
}

export async function cancelSubscriptionAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current) return;

  const product = formData.get("product");
  if (typeof product !== "string") return;

  await cancelSubscription(current.user.id, product);
  revalidatePath("/");
}

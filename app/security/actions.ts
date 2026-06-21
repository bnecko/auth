"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { revokeAuthorizationsForUser } from "@/lib/server/repositories/authorizations";
import { revokeAllOAuthTokensForUser } from "@/lib/server/repositories/oauth";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import {
  listSessionsForUser,
  revokeOtherSessionsForUser,
} from "@/lib/server/repositories/sessions";
import { requestContextFromHeaders } from "@/lib/server/http";
import { changePasswordForUser } from "@/lib/server/services/auth";
import { getCurrentSession, assertNotRestricted } from "@/lib/server/session";
import { canRevokeOtherSessions } from "@/lib/sessionPolicy";

export type ChangePasswordState = { error?: string; success?: boolean } | null;

export async function revokeOtherSessionsAction() {
  const current = await getCurrentSession();
  if (!current) return;
  assertNotRestricted(current);

  // Only an established (24h+) or the oldest session may revoke others.
  const sessions = await listSessionsForUser(current.user.id);
  if (!canRevokeOtherSessions(current.session.id, sessions)) return;

  await revokeOtherSessionsForUser({
    userId: current.user.id,
    currentSessionId: current.session.id,
  });
  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "security_center_sessions",
    result: "revoked_other_sessions",
    context: requestContextFromHeaders(await headers()),
  });
  revalidatePath("/", "layout");
}

// CSRF is covered by Next.js server-action origin verification plus the
// SameSite=Lax session cookie, matching the other mutations in this file
// (revokeOtherSessionsAction / revokeAllOAuthGrantsAction). The action also
// requires the current password, so a forged submit cannot change it blind.
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const current = await getCurrentSession();
  if (!current) {
    return { error: "Your session has expired. Sign in again." };
  }
  assertNotRestricted(current);

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  if (!currentPassword || !newPassword) {
    return { error: "Enter your current and new password." };
  }

  try {
    await changePasswordForUser({
      userId: current.user.id,
      currentPassword,
      newPassword,
      currentSessionId: current.session.id,
      context: requestContextFromHeaders(await headers()),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not change password." };
  }

  revalidatePath("/settings/security");
  return { success: true };
}

export async function revokeAllOAuthGrantsAction() {
  const current = await getCurrentSession();
  if (!current) return;
  assertNotRestricted(current);

  await revokeAuthorizationsForUser(current.user.id);
  await revokeAllOAuthTokensForUser(current.user.id);
  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "security_center_oauth",
    result: "revoked_all_grants",
    context: requestContextFromHeaders(await headers()),
  });
  revalidatePath("/", "layout");
}

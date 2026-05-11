"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { revokeAuthorizationsForUser } from "@/lib/server/repositories/authorizations";
import { revokeAllOAuthTokensForUser } from "@/lib/server/repositories/oauth";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { revokeOtherSessionsForUser } from "@/lib/server/repositories/sessions";
import { requestContextFromHeaders } from "@/lib/server/http";
import { getCurrentSession } from "@/lib/server/session";

export async function revokeOtherSessionsAction() {
  const current = await getCurrentSession();
  if (!current) return;

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
  revalidatePath("/security");
  revalidatePath("/");
}

export async function revokeAllOAuthGrantsAction() {
  const current = await getCurrentSession();
  if (!current) return;

  await revokeAuthorizationsForUser(current.user.id);
  await revokeAllOAuthTokensForUser(current.user.id);
  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "security_center_oauth",
    result: "revoked_all_grants",
    context: requestContextFromHeaders(await headers()),
  });
  revalidatePath("/security");
  revalidatePath("/");
}

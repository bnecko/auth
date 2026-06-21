"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName } from "@/lib/server/config";
import { requestContextFromHeaders } from "@/lib/server/http";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { revokeSessionsForUser } from "@/lib/server/repositories/sessions";
import { deactivateAccount } from "@/lib/server/repositories/users";
import { getCurrentSession, assertNotRestricted } from "@/lib/server/session";

// Reversible: marks the account deactivated and signs out everywhere. The next
// successful sign-in clears the flag (see createUserSession), so there is no
// password step-up here - logging back in is the recovery path.
export async function deactivateAccountAction() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  assertNotRestricted(current);

  await deactivateAccount(current.user.id);
  await revokeSessionsForUser(current.user.id);
  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "account_deactivated",
    result: "ok",
    context: requestContextFromHeaders(await headers()),
  });

  (await cookies()).delete(sessionCookieName);
  redirect("/login");
}

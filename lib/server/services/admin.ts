import type { NextRequest } from "next/server";
import { requestContext, requestContextFromHeaders, type RequestContext } from "../http";
import { revokeAllOAuthTokensForUser } from "../repositories/oauth";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { revokeSessionsForUser } from "../repositories/sessions";
import { setUserStatus } from "../repositories/users";
import type { User, UserStatus } from "../types";

export function requireAdmin(user: User) {
  if (user.role !== "admin") {
    throw new Error("admin required");
  }
}

export async function setAccountStatus(
  targetUserId: number,
  status: UserStatus,
  admin: User,
  context: RequestContext,
) {
  requireAdmin(admin);

  await setUserStatus(targetUserId, status);
  if (status === "banned") {
    // Killing the session cookie alone leaves any active OAuth
    // tokens (access + refresh) usable until natural expiry. The
    // user can keep hitting /api/oauth/userinfo, refresh into a new
    // access token, and continue calling protected endpoints. Revoke
    // both layers so a ban actually bans.
    await revokeSessionsForUser(targetUserId);
    await revokeAllOAuthTokensForUser(targetUserId);
  }

  await recordSecurityEvent({
    userId: targetUserId,
    eventType: status === "banned" ? "account_banned" : "account_status_changed",
    result: status,
    context,
    metadata: { adminId: admin.publicId },
  });
}

// Convenience wrapper for route handlers that have a NextRequest.
export async function setAccountStatusFromRequest(
  targetUserId: number,
  status: UserStatus,
  admin: User,
  req: NextRequest,
) {
  return setAccountStatus(targetUserId, status, admin, requestContext(req));
}

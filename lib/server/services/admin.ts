import type { NextRequest } from "next/server";
import { requestContext, requestContextFromHeaders, type RequestContext } from "../http";
import { revokeAllOAuthTokensForUser } from "../repositories/oauth";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { revokeSessionsForUser } from "../repositories/sessions";
import { findUserById, setUserStatus } from "../repositories/users";
import { createTelegramIdBan, revokeBansForUser } from "../repositories/bans";
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
  reason: string | null = null,
) {
  requireAdmin(admin);
  // Guard here too (not just in the server action) so the route handler that
  // also calls setAccountStatus can't be used to self-ban.
  if (status === "banned" && targetUserId === admin.id) {
    throw new Error("cannot ban yourself");
  }

  await setUserStatus(targetUserId, status);
  if (status === "banned") {
    // Killing the session cookie alone leaves any active OAuth
    // tokens (access + refresh) usable until natural expiry. The
    // user can keep hitting /api/oauth/userinfo, refresh into a new
    // access token, and continue calling protected endpoints. Revoke
    // both layers so a ban actually bans.
    await revokeSessionsForUser(targetUserId);
    await revokeAllOAuthTokensForUser(targetUserId);
    // Also ban the Telegram identity so a recreated account (new
    // username/email, same Telegram) is blocked at registration/login.
    const target = await findUserById(targetUserId);
    if (target?.telegramId) {
      await createTelegramIdBan({
        telegramId: target.telegramId,
        userId: targetUserId,
        reason,
        createdByUserId: admin.id,
      });
    }
  } else if (status === "active") {
    // Unban lifts the Telegram-ID ban created above.
    await revokeBansForUser(targetUserId);
  }

  await recordSecurityEvent({
    userId: targetUserId,
    eventType: status === "banned" ? "account_banned" : "account_status_changed",
    result: status,
    context,
    metadata: { adminId: admin.publicId, ...(reason ? { reason } : {}) },
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

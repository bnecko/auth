import type { NextRequest } from "next/server";
import { requestContext } from "../http";
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
  req: NextRequest,
) {
  requireAdmin(admin);

  await setUserStatus(targetUserId, status);
  if (status === "banned") {
    await revokeSessionsForUser(targetUserId);
  }

  await recordSecurityEvent({
    userId: targetUserId,
    eventType: status === "banned" ? "account_banned" : "account_status_changed",
    result: status,
    context: requestContext(req),
    metadata: { adminId: admin.publicId },
  });
}

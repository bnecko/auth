import { getCurrentSession } from "./session";
import { getSupportTeamRole, isSupportTeamMember } from "./repositories/support";
import type { User } from "./types";

// A supporter is an account on the support_team roster. Admins are not
// automatically on the roster but always have supporter powers (see
// canHandleSupport).
export async function isSupporter(userId: number) {
  return isSupportTeamMember(userId);
}

export async function canHandleSupport(user: Pick<User, "id" | "role">) {
  if (user.role === "admin") {
    return true;
  }
  return isSupportTeamMember(user.id);
}

// Page / server-action guard: the viewer must be an admin or a supporter.
// Throws (mirroring requireAdminStepUpSession) so callers let it bubble to the
// Next.js error boundary, or catch it to redirect.
export async function requireSupporterSession() {
  const current = await getCurrentSession();
  if (!current || !(await canHandleSupport(current.user))) {
    throw new Error("forbidden");
  }
  return current;
}

// Security team: admins, plus support_team members with a security role. These
// can view/reply in restricted users' security threads.
export async function canHandleSecurity(user: Pick<User, "id" | "role">) {
  if (user.role === "admin") return true;
  const role = await getSupportTeamRole(user.id);
  return role === "security" || role === "security_high";
}

// Only admins and high-security supporters may actually restrict/lift a user.
export async function canRestrict(user: Pick<User, "id" | "role">) {
  if (user.role === "admin") return true;
  return (await getSupportTeamRole(user.id)) === "security_high";
}

export async function requireSecuritySession() {
  const current = await getCurrentSession();
  if (!current || !(await canHandleSecurity(current.user))) {
    throw new Error("forbidden");
  }
  return current;
}

import type { NextRequest } from "next/server";
import { forbidden, unauthorized } from "./http";
import { getCurrentSession, getSessionFromRequest } from "./session";
import { isAdminStepUpVerified } from "./adminStepUp";

export function bearerToken(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export async function requireUser(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.user.status === "banned") {
    return { response: unauthorized(), session: null };
  }
  // A restricted account keeps a session (so it can reach /restricted in the
  // browser) but is cut off from every API. Distinct code, not a bare 401.
  if (session.user.restricted) {
    return { response: forbidden("account restricted"), session: null };
  }

  return { response: null, session };
}

// Guards the admin write APIs (ban/unban/security export). The admin role
// alone is not enough: a stolen admin session cookie could call these
// directly, bypassing the Telegram step-up that app/admin/layout.tsx
// enforces for the UI. Require a live step-up grant here too.
export async function requireAdminStepUp(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) {
    return auth;
  }
  if (auth.session.user.role !== "admin") {
    return { response: forbidden(), session: null };
  }
  if (!(await isAdminStepUpVerified(auth.session.user.id))) {
    return { response: forbidden("admin step-up required"), session: null };
  }
  return auth;
}

// Server-action counterpart to requireAdminStepUp. Next.js runs a Server
// Action body on the action POST itself, before the page and its layout
// re-render, so the step-up redirect in app/admin/layout.tsx does not gate
// actions: a stolen admin cookie could invoke an admin mutation directly.
// Admin write actions must assert the step-up themselves. Throws (the
// action transport has no response object), mirroring the existing
// role-check throws these actions already used.
export async function requireAdminStepUpSession() {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") {
    throw new Error("forbidden");
  }
  if (!(await isAdminStepUpVerified(current.user.id))) {
    throw new Error("admin step-up required");
  }
  return current;
}

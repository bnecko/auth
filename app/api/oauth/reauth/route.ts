import { NextResponse, type NextRequest } from "next/server";
import { authBaseUrl } from "@/lib/server/config";
import { clearUserSession } from "@/lib/server/session";

export const runtime = "nodejs";

// Triggered from /oauth/authorize when prompt=login or max_age forces
// re-authentication. Clears the existing session cookie (and revokes
// the DB row) before sending the user back through /login, so the
// resulting fresh login is the only valid session — the old one
// can't survive the forced re-auth.
//
// `next` must point at the authorize endpoint we came from. Any
// other value is rejected so this handler can't be used as a generic
// open redirect.
export async function GET(req: NextRequest) {
  const nextParam = req.nextUrl.searchParams.get("next") || "/";
  const safeNext = nextParam.startsWith("/oauth/authorize?") ? nextParam : "/";

  const target = new URL("/login", authBaseUrl());
  target.searchParams.set("next", safeNext);

  const response = NextResponse.redirect(target.toString());
  await clearUserSession(req, response);
  return response;
}

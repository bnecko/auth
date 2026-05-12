import { NextResponse, type NextRequest } from "next/server";
import { authBaseUrl, isProduction, sessionCookieName } from "@/lib/server/config";
import { requestContext } from "@/lib/server/http";
import { findExternalAppByClientId } from "@/lib/server/repositories/externalApps";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { revokeSession } from "@/lib/server/repositories/sessions";
import { findSessionByToken } from "@/lib/server/repositories/sessions";
import { verifyIdToken } from "@/lib/server/services/oauth";

export const runtime = "nodejs";

// RP-initiated logout per OIDC. The relying party redirects the
// browser here with id_token_hint pointing at the user's prior ID
// token; we revoke our local session and bounce the browser back to
// the post_logout_redirect_uri only when it appears on the client's
// registered allowlist.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const idTokenHint = url.searchParams.get("id_token_hint") || "";
  const postLogoutRedirectUri = url.searchParams.get("post_logout_redirect_uri") || "";
  const state = url.searchParams.get("state") || "";
  const clientIdParam = url.searchParams.get("client_id") || "";

  const sessionToken = req.cookies.get(sessionCookieName)?.value || "";
  const session = sessionToken ? await findSessionByToken(sessionToken) : null;

  if (sessionToken) {
    await revokeSession(sessionToken);
  }

  let redirectTarget: URL | null = null;
  let clientPublicId: string | null = null;
  let subject: string | null = null;

  if (idTokenHint) {
    const claims = verifyIdToken(idTokenHint);
    if (claims) {
      clientPublicId =
        typeof claims.aud === "string"
          ? claims.aud
          : Array.isArray(claims.aud) && typeof claims.aud[0] === "string"
            ? (claims.aud[0] as string)
            : null;
      subject = typeof claims.sub === "string" ? claims.sub : null;

      // RFC 7662-style: if client_id was supplied, it must match aud.
      // A mismatch is treated as no hint at all — we'll log out the
      // local session but refuse to redirect to a third party.
      const clientMatches =
        !clientIdParam || (clientPublicId !== null && clientIdParam === clientPublicId);

      if (clientMatches && clientPublicId) {
        const app = await findExternalAppByClientId(clientPublicId);
        if (
          app &&
          app.status === "active" &&
          postLogoutRedirectUri &&
          postLogoutRedirectUriAllowed(postLogoutRedirectUri, app.postLogoutRedirectUrls)
        ) {
          redirectTarget = new URL(postLogoutRedirectUri);
          if (state) {
            redirectTarget.searchParams.set("state", state);
          }
        }
      }
    }
  }

  if (session) {
    await recordSecurityEvent({
      userId: session.user.id,
      eventType: "oauth_logout",
      result: redirectTarget ? "redirected" : "ok",
      context: requestContext(req),
      metadata: {
        clientId: clientPublicId,
        subject,
        hadIdTokenHint: Boolean(idTokenHint),
        redirectedTo: redirectTarget?.origin || null,
      },
    });
  }

  const response = NextResponse.redirect(
    redirectTarget ? redirectTarget.toString() : `${authBaseUrl()}/login`,
  );
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

// Matches the allowed list with exact URL equality, mirroring the
// strictness of the authorize-redirect allowlist. An empty allowlist
// means "no redirect permitted" — we fall back to the local logout
// page rather than bouncing to an attacker-controlled URL.
function postLogoutRedirectUriAllowed(uri: string, allowed: readonly string[]) {
  if (allowed.length === 0) return false;
  let candidate: URL;
  try {
    candidate = new URL(uri);
  } catch {
    return false;
  }
  if (candidate.protocol !== "https:" && candidate.protocol !== "http:") {
    return false;
  }
  candidate.hash = "";
  return allowed.some(entry => {
    try {
      const allowedUrl = new URL(entry);
      allowedUrl.hash = "";
      return allowedUrl.href === candidate.href;
    } catch {
      return false;
    }
  });
}

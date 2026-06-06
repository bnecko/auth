import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { verifyAuthorizeCsrf } from "@/lib/server/oauthCsrf";
import { approveOAuthAuthorization } from "@/lib/server/services/oauth";

export const runtime = "nodejs";

// The consent form is a native HTML POST, so the browser navigates to
// whatever this route returns. Success redirects to the client's
// redirect_uri (absolute, already the public host); any failure redirects
// to the /expired page rather than returning JSON a native form would
// render as a raw body. 303 See Other turns the form POST into a GET of
// the target: the default 307 would re-POST the auth code to the client's
// GET-only callback, breaking spec-compliant clients.
function redirectTo(location: string) {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const form = await req.formData();
    const body: Record<string, unknown> = Object.fromEntries(form.entries());
    body.scopes = form.getAll("scopes").map(String);

    const csrfToken = String(body.csrf_token || "");
    const clientId = String(body.client_id || "");
    const state = String(body.state || "");
    if (
      !csrfToken ||
      !verifyAuthorizeCsrf({
        token: csrfToken,
        sessionId: auth.session.session.id,
        clientId,
        state,
      })
    ) {
      return redirectTo("/expired?reason=invalid");
    }

    const target = await approveOAuthAuthorization(
      body,
      auth.session.user,
      req,
      auth.session.session.createdAt,
    );
    return redirectTo(target.toString());
  } catch {
    return redirectTo("/expired?reason=invalid");
  }
}

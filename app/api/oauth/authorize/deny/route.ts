import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { verifyAuthorizeCsrf } from "@/lib/server/oauthCsrf";
import { denyOAuthAuthorization } from "@/lib/server/services/oauth";

export const runtime = "nodejs";

// Like the approve route, the deny form is a native HTML POST. On success
// denyOAuthAuthorization returns the client's redirect_uri carrying
// error=access_denied (absolute, public host); on CSRF or other failure we
// send the browser to /expired rather than returning raw JSON. 303 turns
// the POST into a GET so the default 307 cannot re-POST to a GET-only page.
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

    const target = await denyOAuthAuthorization(body, auth.session.user, req);
    return redirectTo(target.toString());
  } catch {
    return redirectTo("/expired?reason=invalid");
  }
}

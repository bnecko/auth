import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { verifyActivationCsrf } from "@/lib/server/activationCsrf";
import { approveActivationForUser } from "@/lib/server/services/activation";

export const runtime = "nodejs";

// The approve form is a native HTML POST, so the browser navigates to
// whatever this route returns. Every branch therefore ends in a redirect to
// a rendered page; returning a JSON error here would land the user on a raw
// JSON body. The activation page re-derives the request's real state from
// its status, so on any failure we send the user back there (or to /expired
// when we have no token to rebuild the link).
// 303 See Other with a relative Location. 303 turns the form POST into a GET
// of the target (the default 307 would re-POST to the GET-only page). The
// Location is left relative so the browser resolves it against the public
// origin it used, not the app's internal bind address (0.0.0.0:3000) behind
// the Cloudflare tunnel, which new URL(path, req.url) would otherwise bake in.
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function backToActivate(token: string, error?: string) {
  if (!token) {
    return redirectTo("/expired?reason=invalid");
  }
  const query = new URLSearchParams({ token });
  if (error) {
    query.set("error", error);
  }
  return redirectTo(`/activate?${query.toString()}`);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;

  let grantedScopes: string[] | undefined;
  let csrfToken = "";
  let token = "";
  try {
    const formData = await req.formData();
    csrfToken = String(formData.get("csrf_token") || "");
    token = String(formData.get("token") || "");
    if (formData.has("scopes")) {
      grantedScopes = formData.getAll("scopes").map(String);
    }
  } catch {
    // Ignore body parsing errors; the csrf check below fails closed.
  }

  if (
    !csrfToken ||
    !verifyActivationCsrf({
      token: csrfToken,
      sessionId: auth.session.session.id,
      activationId: id,
    })
  ) {
    return backToActivate(token, "csrf");
  }

  try {
    const result = await approveActivationForUser(id, auth.session.user, req, grantedScopes);
    // With a registered return URL, hand the user back to the app. Without
    // one, show the success state on the activation page itself rather than
    // dumping them on the dashboard with no confirmation.
    if (result.returnUrl) {
      return redirectTo(result.returnUrl);
    }
    return token ? backToActivate(token) : redirectTo("/");
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "activation expired") {
      return redirectTo("/expired?reason=expired");
    }
    // "activation is not pending" (double submit) and "subscription required"
    // both render correctly on the activation page from the request's status.
    return backToActivate(token, "failed");
  }
}

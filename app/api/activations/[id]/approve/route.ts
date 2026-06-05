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
function redirectTo(req: NextRequest, path: string) {
  // 303 See Other: this handler runs on a form POST, so the browser must GET
  // the target. NextResponse.redirect defaults to 307, which preserves the
  // method and would re-POST to the GET-only activation page.
  return NextResponse.redirect(new URL(path, req.url), 303);
}

function backToActivate(req: NextRequest, token: string, error?: string) {
  if (!token) {
    return redirectTo(req, "/expired?reason=invalid");
  }
  const query = new URLSearchParams({ token });
  if (error) {
    query.set("error", error);
  }
  return redirectTo(req, `/activate?${query.toString()}`);
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
    return backToActivate(req, token, "csrf");
  }

  try {
    const result = await approveActivationForUser(id, auth.session.user, req, grantedScopes);
    // With a registered return URL, hand the user back to the app. Without
    // one, show the success state on the activation page itself rather than
    // dumping them on the dashboard with no confirmation.
    if (result.returnUrl) {
      return redirectTo(req, result.returnUrl);
    }
    return token ? backToActivate(req, token) : redirectTo(req, "/");
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "activation expired") {
      return redirectTo(req, "/expired?reason=expired");
    }
    // "activation is not pending" (double submit) and "subscription required"
    // both render correctly on the activation page from the request's status.
    return backToActivate(req, token, "failed");
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { verifyActivationCsrf } from "@/lib/server/activationCsrf";
import { denyActivationForUser } from "@/lib/server/services/activation";

export const runtime = "nodejs";

// Native HTML POST: every branch must redirect to a rendered page rather
// than return JSON, or the browser shows a raw error body. 303 turns the POST
// into a GET; the relative Location resolves against the public origin rather
// than the app's internal bind address behind the tunnel.
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
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

  let csrfToken = "";
  let token = "";
  try {
    const formData = await req.formData();
    csrfToken = String(formData.get("csrf_token") || "");
    token = String(formData.get("token") || "");
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
    return token
      ? redirectTo(`/activate?token=${encodeURIComponent(token)}&error=csrf`)
      : redirectTo("/expired?reason=invalid");
  }

  try {
    await denyActivationForUser(id, auth.session.user, req);
    return redirectTo("/expired?reason=denied");
  } catch {
    return redirectTo("/expired?reason=invalid");
  }
}

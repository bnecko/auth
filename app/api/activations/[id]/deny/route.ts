import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { verifyActivationCsrf } from "@/lib/server/activationCsrf";
import { denyActivationForUser } from "@/lib/server/services/activation";

export const runtime = "nodejs";

// Native HTML POST: every branch must redirect to a rendered page rather
// than return JSON, or the browser shows a raw error body.
function redirectTo(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.url));
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
      ? redirectTo(req, `/activate?token=${encodeURIComponent(token)}&error=csrf`)
      : redirectTo(req, "/expired?reason=invalid");
  }

  try {
    await denyActivationForUser(id, auth.session.user, req);
    return redirectTo(req, "/expired?reason=denied");
  } catch {
    return redirectTo(req, "/expired?reason=invalid");
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/server/session";
import { verifyTelegramLogin } from "@/lib/server/telegram";
import { grantAdminStepUp } from "@/lib/server/adminStepUp";

export const runtime = "nodejs";

// Relative Location so the browser resolves it against the public origin
// it used, not the app's internal bind address (0.0.0.0:3000) behind the
// Cloudflare tunnel, which new URL(path, req.url) would otherwise bake in.
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

// Telegram Login Widget sends auth data as GET query params to data-auth-url
// after the user approves. We verify the payload matches the admin's linked
// Telegram identity before granting the step-up token.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.user.role !== "admin") {
    return redirectTo("/");
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const identity = verifyTelegramLogin(params);
  if (!identity) {
    return redirectTo("/admin/verify?error=invalid_payload");
  }

  if (identity.id !== session.user.telegramId) {
    return redirectTo("/admin/verify?error=identity_mismatch");
  }

  await grantAdminStepUp(session.user.id);

  return redirectTo("/admin");
}

import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/server/session";
import { verifyTelegramLogin } from "@/lib/server/telegram";
import { grantAdminStepUp } from "@/lib/server/adminStepUp";

export const runtime = "nodejs";

// Telegram Login Widget sends auth data as GET query params to data-auth-url
// after the user approves. We verify the payload matches the admin's linked
// Telegram identity before granting the step-up token.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const identity = verifyTelegramLogin(params);
  if (!identity) {
    return NextResponse.redirect(
      new URL("/admin/verify?error=invalid_payload", req.url),
    );
  }

  if (identity.id !== session.user.telegramId) {
    return NextResponse.redirect(
      new URL("/admin/verify?error=identity_mismatch", req.url),
    );
  }

  await grantAdminStepUp(session.user.id);

  return NextResponse.redirect(new URL("/admin", req.url));
}

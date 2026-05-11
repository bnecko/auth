import { NextResponse, type NextRequest } from "next/server";
import { verifyTelegramLogin } from "@/lib/server/telegram";
import { findUserByTelegramId, linkTelegram } from "@/lib/server/repositories/users";
import { createUserSession, getSessionFromRequest } from "@/lib/server/session";
import { authBaseUrl } from "@/lib/server/config";
import { requestContext } from "@/lib/server/http";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const payload = Object.fromEntries(req.nextUrl.searchParams.entries());
  const base = authBaseUrl();
  const telegram = verifyTelegramLogin(payload);
  if (!telegram) {
    return NextResponse.redirect(new URL("/login?error=telegram", base));
  }

  const current = await getSessionFromRequest(req);
  if (current) {
    // linkTelegram refuses to overwrite an existing link or to bind a TG id
    // already used by another account. A null return surfaces both cases to
    // the user; the intent is to make this path safe against CSRF where an
    // attacker's signed Telegram payload would otherwise rebind the victim
    // account to the attacker's TG identity on a cross-site GET.
    const linked = await linkTelegram(current.user.id, telegram);
    await recordSecurityEvent({
      userId: current.user.id,
      eventType: "telegram_2fa_link",
      result: linked ? "success" : "failure",
      context: requestContext(req),
      metadata: { telegramId: telegram.id },
    });
    const url = new URL("/", base);
    if (!linked) {
      url.searchParams.set("error", "telegram_link_failed");
    }
    return NextResponse.redirect(url);
  }

  const user = await findUserByTelegramId(telegram.id);
  if (!user) {
    return NextResponse.redirect(new URL("/register?error=telegram_unlinked", base));
  }

  const res = NextResponse.redirect(new URL("/", base));
  await createUserSession(user.id, req, res);
  return res;
}

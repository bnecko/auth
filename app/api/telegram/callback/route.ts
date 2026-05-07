import { NextResponse, type NextRequest } from "next/server";
import { verifyTelegramLogin } from "@/lib/server/telegram";
import { findUserByTelegramId, linkTelegram } from "@/lib/server/repositories/users";
import { createUserSession, getSessionFromRequest } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const payload = Object.fromEntries(req.nextUrl.searchParams.entries());
  const telegram = verifyTelegramLogin(payload);
  if (!telegram) {
    return NextResponse.redirect(new URL("/login?error=telegram", req.url));
  }

  const current = await getSessionFromRequest(req);
  if (current) {
    await linkTelegram(current.user.id, telegram);
    return NextResponse.redirect(new URL("/", req.url));
  }

  const user = await findUserByTelegramId(telegram.id);
  if (!user) {
    return NextResponse.redirect(new URL("/register?error=telegram_unlinked", req.url));
  }

  const res = NextResponse.redirect(new URL("/", req.url));
  await createUserSession(user.id, req, res);
  return res;
}

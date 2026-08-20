import { NextResponse, type NextRequest } from "next/server";
import { verifyTelegramLogin } from "@/lib/server/telegram";
import { findUserByTelegramId } from "@/lib/server/repositories/users";
import { isTelegramIdBanned } from "@/lib/server/repositories/bans";
import { createUserSession, getSessionFromRequest } from "@/lib/server/session";
import { authBaseUrl } from "@/lib/server/config";
import { hashToken } from "@/lib/server/crypto";
import redis from "@/lib/server/redis";

export const runtime = "nodejs";

// Matches the freshness window verifyTelegramLogin allows, so a signed payload
// is single-use across its entire validity, not just once per short burst.
const LOGIN_PAYLOAD_TTL_SECONDS = 86400;

export async function GET(req: NextRequest) {
  const payload = Object.fromEntries(req.nextUrl.searchParams.entries());
  const base = authBaseUrl();
  const telegram = verifyTelegramLogin(payload);
  if (!telegram) {
    return NextResponse.redirect(new URL("/login?error=telegram", base));
  }

  // Never link a Telegram account from this bare GET. Linking goes through the
  // /relink bot-approval flow, which binds the action to an interactive Approve
  // in the user's own Telegram. Auto-linking here was a CSRF account-takeover:
  // a cross-site GET carries the victim's SameSite=Lax session cookie, so an
  // attacker could bind their own Telegram identity onto a logged-in, unlinked
  // victim and then replay the same payload with no session to log in as them.
  const current = await getSessionFromRequest(req);
  if (current) {
    return NextResponse.redirect(new URL("/relink", base));
  }

  // Single-use the signed payload: a captured login payload must not be
  // replayable within its freshness window. SET NX returns null if the key
  // already exists, i.e. this exact payload was already presented.
  const fresh = await redis.set(
    `tg:login:used:${hashToken(String(payload.hash))}`,
    "1",
    "EX",
    LOGIN_PAYLOAD_TTL_SECONDS,
    "NX",
  );
  if (fresh === null) {
    return NextResponse.redirect(new URL("/login?error=telegram", base));
  }

  const user = await findUserByTelegramId(telegram.id);
  if (!user) {
    return NextResponse.redirect(new URL("/register?error=telegram_unlinked", base));
  }
  // Every other login sink (password, passkey, OAuth, bot-push 2FA) rejects a
  // banned principal before issuing a session. This branch resolves the user
  // straight from a Telegram-signed payload the banned owner can re-issue at
  // will, so it must enforce the same gate - including the telegram_id ban that
  // outlives account recreation - or a ban can be self-served away.
  if (user.status === "banned" || (await isTelegramIdBanned(telegram.id))) {
    return NextResponse.redirect(new URL("/login?error=telegram", base));
  }

  const res = NextResponse.redirect(new URL("/", base));
  await createUserSession(user.id, req, res);
  return res;
}

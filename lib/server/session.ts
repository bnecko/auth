import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  isProduction,
  loginChallengeCookieName,
  login2faTtlMinutes,
  sessionCookieName,
  sessionMaxAgeSeconds,
  sessionShortAgeSeconds,
} from "./config";
import { randomToken } from "./crypto";
import { requestContext } from "./http";
import {
  createSession,
  findSessionByToken,
  revokeSession,
} from "./repositories/sessions";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) {
    return null;
  }

  return findSessionByToken(token);
}

export async function getSessionFromRequest(req: NextRequest) {
  const token = req.cookies.get(sessionCookieName)?.value;
  if (!token) {
    return null;
  }

  return findSessionByToken(token);
}

export async function createUserSession(
  userId: number,
  req: NextRequest,
  res: NextResponse,
  options: { remember?: boolean } = { remember: true },
) {
  const token = randomToken();
  const context = requestContext(req);
  const maxAge = options.remember
    ? sessionMaxAgeSeconds()
    : sessionShortAgeSeconds();
  const expiresAt = new Date(Date.now() + maxAge * 1000);

  await createSession({
    userId,
    token,
    ip: context.ip,
    userAgent: context.userAgent,
    expiresAt,
  });

  const cookie = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
  } as const;

  res.cookies.set(sessionCookieName, token, options.remember
    ? { ...cookie, expires: expiresAt }
    : cookie);
}

export async function clearUserSession(req: NextRequest, res: NextResponse) {
  const token = req.cookies.get(sessionCookieName)?.value;
  if (token) {
    await revokeSession(token);
  }

  res.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function setLoginChallengeCookie(res: NextResponse, token: string) {
  res.cookies.set(loginChallengeCookieName, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: login2faTtlMinutes() * 60,
  });
}

export function clearLoginChallengeCookie(res: NextResponse) {
  res.cookies.set(loginChallengeCookieName, "", {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  isProduction,
  sessionCookieName,
  sessionMaxAgeSeconds,
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
) {
  const token = randomToken();
  const context = requestContext(req);
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds() * 1000);

  await createSession({
    userId,
    token,
    ip: context.ip,
    userAgent: context.userAgent,
    expiresAt,
  });

  res.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
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

import { NextResponse, type NextRequest } from "next/server";
import { loginChallengeCookieName } from "@/lib/server/config";
import { badRequest, json, requestBody, requestContext } from "@/lib/server/http";
import {
  clearLoginChallengeCookie,
  createUserSession,
} from "@/lib/server/session";
import { completeTelegramLoginChallenge } from "@/lib/server/services/auth";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const browserToken = req.cookies.get(loginChallengeCookieName)?.value || "";
  if (!browserToken) {
    return badRequest("verification browser session is missing");
  }

  // Bound 2FA-code submissions per IP across challenges. The service layer
  // additionally caps wrong tries against a single challenge.
  const ip = requestContext(req).ip || "unknown";
  const rl = await rateLimit(`rl:2fa:ip:${ip}`, 20, 15 * 60 * 1000);
  if (!rl.success) {
    return json({ error: "Too many attempts. Please try again later." }, 429);
  }

  const body = await requestBody(req);
  const code = typeof body.code === "string" ? body.code : "";
  if (!/^\d{6}$/.test(code.trim())) {
    return badRequest("enter the 6-digit code");
  }

  try {
    const { id } = await params;
    const result = await completeTelegramLoginChallenge(id, browserToken, code, req);
    const res = NextResponse.json({ redirectTo: "/account" });
    clearLoginChallengeCookie(res);
    await createUserSession(result.user.id, req, res, {
      remember: result.remember,
    });
    return res;
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "verification failed");
  }
}

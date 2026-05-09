import { NextResponse, type NextRequest } from "next/server";
import { loginChallengeCookieName } from "@/lib/server/config";
import { badRequest } from "@/lib/server/http";
import {
  clearLoginChallengeCookie,
  createUserSession,
} from "@/lib/server/session";
import { completeTelegramLoginChallenge } from "@/lib/server/services/auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const browserToken = req.cookies.get(loginChallengeCookieName)?.value || "";
  if (!browserToken) {
    return badRequest("verification browser session is missing");
  }

  try {
    const { id } = await params;
    const result = await completeTelegramLoginChallenge(id, browserToken, req);
    const res = NextResponse.json({ redirectTo: "/" });
    clearLoginChallengeCookie(res);
    await createUserSession(result.user.id, req, res, {
      remember: result.remember,
    });
    return res;
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "verification failed");
  }
}

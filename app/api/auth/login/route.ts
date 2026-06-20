import { NextResponse, type NextRequest } from "next/server";
import { badRequest, json, requestBody, requestContext } from "@/lib/server/http";
import {
  createTelegramLoginChallenge,
  loginUser,
} from "@/lib/server/services/auth";
import {
  createUserSession,
  setLoginChallengeCookie,
} from "@/lib/server/session";
import { parseLoginInput } from "@/lib/server/validation";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await requestBody(req);
  const { input, errors } = parseLoginInput(body);
  if (Object.keys(errors).length > 0) {
    return json({ errors }, 400);
  }

  // requestContext honors TRUSTED_PROXY; reading x-forwarded-for raw
  // lets any caller spoof the header and bypass per-IP rate limiting.
  const ip = requestContext(req).ip || "unknown";
  const rl = await rateLimit(`rl:login:ip:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.success) {
    return json({ errors: { form: "Too many login attempts. Please try again later." } }, 429);
  }

  try {
    const user = await loginUser(input, req);
    if (user.telegramId) {
      // createTelegramLoginChallenge pushes the approval prompt straight to the
      // user's Telegram - no t.me link needed for login.
      const result = await createTelegramLoginChallenge(user, input.remember, req);
      const res = NextResponse.json(
        {
          requiresTelegram: true,
          challengeId: result.challenge.publicId,
          expiresAt: result.challenge.expiresAt,
        },
        { status: 202 },
      );
      setLoginChallengeCookie(res, result.browserToken);
      return res;
    }

    const res = NextResponse.json({ redirectTo: "/account" });
    await createUserSession(user.id, req, res, { remember: input.remember });
    return res;
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "login failed");
  }
}

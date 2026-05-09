import { NextResponse, type NextRequest } from "next/server";
import { badRequest, json, requestBody } from "@/lib/server/http";
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

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rl = await rateLimit(`rl:login:ip:${ip}`, 5, 15 * 60 * 1000); // 5 requests per 15 min
  if (!rl.success) {
    return json({ errors: { form: "Too many login attempts. Please try again later." } }, 429);
  }

  try {
    const user = await loginUser(input, req);
    if (user.telegramId) {
      const result = await createTelegramLoginChallenge(user, input.remember, req);
      const botUsername = process.env.TELEGRAM_BOT_USERNAME || "bottleneck_auth_bot";
      const res = NextResponse.json(
        {
          requiresTelegram: true,
          challengeId: result.challenge.publicId,
          expiresAt: result.challenge.expiresAt,
          botUrl: `https://t.me/${botUsername}?start=${result.startToken}`,
        },
        { status: 202 },
      );
      setLoginChallengeCookie(res, result.browserToken);
      return res;
    }

    const res = NextResponse.json({ redirectTo: "/" });
    await createUserSession(user.id, req, res, { remember: input.remember });
    return res;
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "login failed");
  }
}

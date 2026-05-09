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

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await requestBody(req);
  const { input, errors } = parseLoginInput(body);
  if (Object.keys(errors).length > 0) {
    return json({ errors }, 400);
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

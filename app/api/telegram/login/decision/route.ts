import { type NextRequest } from "next/server";
import { env } from "@/lib/server/config";
import { safeEqual } from "@/lib/server/crypto";
import { badRequest, forbidden, json, requestBody } from "@/lib/server/http";
import { decideTelegramLogin } from "@/lib/server/services/auth";

export const runtime = "nodejs";

// Called by the bot when the account owner taps Approve/Deny on the login
// prompt. Authenticated by the shared bot webhook secret; the decision is
// further scoped to the Telegram account the challenge belongs to.
export async function POST(req: NextRequest) {
  const secret = env("TELEGRAM_BOT_WEBHOOK_SECRET");
  const provided = req.headers.get("x-bottleneck-bot-secret") || "";
  if (!secret || !safeEqual(provided, secret)) {
    return forbidden();
  }

  const body = await requestBody(req);
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
  const telegramId = typeof body.telegramId === "string" ? body.telegramId : "";
  const decision =
    body.decision === "approve" || body.decision === "deny" ? body.decision : "";

  if (!challengeId || !telegramId || !decision) {
    return badRequest("challengeId, telegramId and decision are required");
  }

  const challenge = await decideTelegramLogin({
    challengeId,
    decision,
    telegramId,
    req,
  });
  if (!challenge) {
    return badRequest("login request not found or already handled");
  }

  return json({ status: challenge.status, kind: "login_decision", decision });
}

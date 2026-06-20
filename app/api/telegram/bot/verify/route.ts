import { type NextRequest } from "next/server";
import { env } from "@/lib/server/config";
import { safeEqual } from "@/lib/server/crypto";
import { badRequest, forbidden, json, requestBody } from "@/lib/server/http";
import {
  requestTelegramLoginApproval,
  requestTelegramRegistrationApproval,
  requestTelegramRelinkApproval,
} from "@/lib/server/services/auth";

export const runtime = "nodejs";

// The bot calls this when a user opens it with a /start token. Every flow now
// asks the user to Approve/Deny in Telegram rather than completing on contact,
// so this endpoint only *sends the prompt* and reports which flow matched. The
// actual link/sign-in happens later via /api/telegram/confirm/decision.
export async function POST(req: NextRequest) {
  const secret = env("TELEGRAM_BOT_WEBHOOK_SECRET");
  const provided = req.headers.get("x-bottleneck-bot-secret") || "";
  if (!secret || !safeEqual(provided, secret)) {
    return forbidden();
  }

  const body = await requestBody(req);
  const startToken = readStartToken(body);
  const telegram = {
    id: String(body.telegram_id || ""),
    firstName: String(body.telegram_first_name || ""),
    username: body.telegram_username ? String(body.telegram_username) : null,
  };

  if (!startToken || !telegram.id) {
    return badRequest("start token and telegram id are required");
  }

  try {
    const relink = await requestTelegramRelinkApproval(startToken, telegram, req);
    if (relink) {
      return json({ kind: "relink_pending" });
    }

    const loginChallenge = await requestTelegramLoginApproval(startToken, telegram, req);
    if (loginChallenge) {
      return json({
        challengeId: loginChallenge.publicId,
        status: loginChallenge.status,
        kind: "login_pending",
      });
    }

    const registration = await requestTelegramRegistrationApproval(
      startToken,
      telegram,
      req,
    );
    if (registration) {
      return json({
        verificationId: registration.publicId,
        status: registration.status,
        kind: "registration_pending",
      });
    }

    return badRequest("this verification link is invalid or expired");
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "verification failed");
  }
}

function readStartToken(body: Record<string, unknown>) {
  if (typeof body.startToken === "string") {
    return body.startToken;
  }

  if (typeof body.token === "string") {
    return body.token;
  }

  if (typeof body.code === "string") {
    return body.code;
  }

  return "";
}

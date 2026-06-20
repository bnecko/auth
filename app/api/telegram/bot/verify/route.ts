import { type NextRequest } from "next/server";
import { env } from "@/lib/server/config";
import { hashToken, safeEqual } from "@/lib/server/crypto";
import { badRequest, forbidden, json, requestBody, requestContext } from "@/lib/server/http";
import {
  requestTelegramLoginApproval,
  verifyRegistrationByTelegram,
} from "@/lib/server/services/auth";
import { completeRelinkByTelegram } from "@/lib/server/relinkChallenge";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

export const runtime = "nodejs";

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
    const relink = await completeRelinkByTelegram(startToken, telegram);
    if (relink) {
      await recordSecurityEvent({
        userId: relink.userId,
        eventType: "telegram_2fa_relink",
        result: relink.linked ? "success" : "failure",
        context: requestContext(req),
        metadata: { telegramId: telegram.id },
      });
      return json({ kind: "relink", linked: relink.linked });
    }

    const loginChallenge = await requestTelegramLoginApproval(
      startToken,
      telegram,
      req,
    );
    if (loginChallenge) {
      // We sent the user an approve/deny prompt; the login is not verified yet.
      return json({
        challengeId: loginChallenge.publicId,
        status: loginChallenge.status,
        kind: "login_pending",
      });
    }

    const request = await verifyRegistrationByTelegram(startToken, telegram, req);
    return json({
      verificationId: request.publicId,
      verificationHash: hashToken(request.publicId),
      status: request.status,
      kind: "registration",
    });
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

import { type NextRequest } from "next/server";
import { env } from "@/lib/server/config";
import { hashToken } from "@/lib/server/crypto";
import { badRequest, forbidden, json, requestBody, requestContext } from "@/lib/server/http";
import {
  verifyRegistrationByTelegram,
  verifyTelegramLoginChallenge,
} from "@/lib/server/services/auth";
import { completeRelinkByTelegram } from "@/lib/server/relinkChallenge";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = env("TELEGRAM_BOT_WEBHOOK_SECRET");
  if (secret && req.headers.get("x-bottleneck-bot-secret") !== secret) {
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

    const loginChallenge = await verifyTelegramLoginChallenge(
      startToken,
      telegram,
      req,
    );
    if (loginChallenge) {
      return json({
        challengeId: loginChallenge.publicId,
        verificationHash: hashToken(loginChallenge.publicId),
        status: loginChallenge.status,
        kind: "login",
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

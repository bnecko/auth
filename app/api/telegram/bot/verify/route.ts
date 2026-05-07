import { type NextRequest } from "next/server";
import { env } from "@/lib/server/config";
import { hashToken } from "@/lib/server/crypto";
import { badRequest, forbidden, json, requestBody } from "@/lib/server/http";
import { verifyRegistrationByTelegram } from "@/lib/server/services/auth";

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
    const request = await verifyRegistrationByTelegram(startToken, telegram, req);
    return json({
      verificationId: request.publicId,
      verificationHash: hashToken(request.publicId),
      status: request.status,
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

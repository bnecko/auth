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
  const code = typeof body.code === "string" ? body.code : "";
  const telegram = {
    id: String(body.telegram_id || ""),
    firstName: String(body.telegram_first_name || ""),
    username: body.telegram_username ? String(body.telegram_username) : null,
  };

  if (!code || !telegram.id) {
    return badRequest("code and telegram id are required");
  }

  try {
    const request = await verifyRegistrationByTelegram(code, telegram, req);
    return json({
      verificationId: request.publicId,
      verificationHash: hashToken(request.publicId),
      status: request.status,
    });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "verification failed");
  }
}

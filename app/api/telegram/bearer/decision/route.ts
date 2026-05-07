import { type NextRequest } from "next/server";
import { env } from "@/lib/server/config";
import { badRequest, forbidden, json, requestBody } from "@/lib/server/http";
import { decideBearerRequest } from "@/lib/server/services/bearer";
import { safeEqual } from "@/lib/server/crypto";

export const runtime = "nodejs";

// Called by the dedicated Telegram bot when the admin presses an inline
// Approve/Reject button on a bearer request notification. The bot
// authenticates via the shared TELEGRAM_BOT_WEBHOOK_SECRET header and
// passes the original from.id so the service layer can re-check the
// admin identity (defense in depth — the bot already checks too).
export async function POST(req: NextRequest) {
  const secret = env("TELEGRAM_BOT_WEBHOOK_SECRET");
  const provided = req.headers.get("x-bottleneck-bot-secret") || "";
  if (!secret || !safeEqual(provided, secret)) {
    return forbidden();
  }

  const body = await requestBody(req);
  const requestId = typeof body.id === "string" ? body.id : "";
  const decision = body.decision === "reject" ? "reject" : "approve";
  const adminTelegramId =
    typeof body.adminTelegramId === "string" ? body.adminTelegramId : "";

  if (!requestId || !adminTelegramId) {
    return badRequest("id and adminTelegramId are required");
  }

  try {
    const result = await decideBearerRequest({
      publicId: requestId,
      decision,
      adminTelegramId,
    });
    return json({
      status: result.request.status,
      alreadyDecided: result.alreadyDecided,
    });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "decision failed");
  }
}

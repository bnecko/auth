import { type NextRequest } from "next/server";
import { env } from "@/lib/server/config";
import { safeEqual } from "@/lib/server/crypto";
import { badRequest, forbidden, json, requestBody, requestContext } from "@/lib/server/http";
import {
  decideTelegramLogin,
  decideTelegramRegistration,
  decideTelegramRelink,
} from "@/lib/server/services/auth";
import { decideProfileChange } from "@/lib/server/services/profile";
import { decideBearerRevoke } from "@/lib/server/services/bearer";
import { decideAccountDeletion } from "@/lib/server/services/account";

export const runtime = "nodejs";

// Called by the bot when the account owner taps Approve/Deny on any prompt
// (login, relink, registration). Authenticated by the shared bot webhook
// secret; each flow is further scoped to the Telegram account it belongs to.
export async function POST(req: NextRequest) {
  const secret = env("TELEGRAM_BOT_WEBHOOK_SECRET");
  const provided = req.headers.get("x-bottleneck-bot-secret") || "";
  if (!secret || !safeEqual(provided, secret)) {
    return forbidden();
  }

  const body = await requestBody(req);
  const kind = typeof body.kind === "string" ? body.kind : "";
  const id = typeof body.id === "string" ? body.id : "";
  const decision =
    body.decision === "approve" || body.decision === "deny" ? body.decision : "";
  const telegram = {
    id: typeof body.telegramId === "string" ? body.telegramId : "",
    firstName:
      typeof body.telegramFirstName === "string" ? body.telegramFirstName : "",
    username:
      typeof body.telegramUsername === "string" ? body.telegramUsername : null,
  };

  if (!id || !telegram.id || !decision) {
    return badRequest("id, telegramId and decision are required");
  }

  if (kind === "login") {
    const challenge = await decideTelegramLogin({
      challengeId: id,
      decision,
      telegramId: telegram.id,
      req,
    });
    if (!challenge) {
      return badRequest("login request not found or already handled");
    }
    return json({ kind: "login_decision", status: challenge.status, decision });
  }

  if (kind === "relink") {
    const result = await decideTelegramRelink({ apprId: id, decision, telegram, req });
    if (!result) {
      return badRequest("relink request not found or already handled");
    }
    return json({ kind: "relink_decision", status: result.status, decision });
  }

  if (kind === "registration") {
    const request = await decideTelegramRegistration({
      publicId: id,
      decision,
      telegram,
      req,
    });
    if (!request) {
      return badRequest("registration not found or already handled");
    }
    return json({ kind: "registration_decision", status: request.status, decision });
  }

  if (kind === "profile") {
    const result = await decideProfileChange({
      apprId: id,
      decision,
      telegram,
      context: requestContext(req),
    });
    if (!result) {
      return badRequest("change request not found or already handled");
    }
    return json({ kind: "profile_decision", status: result.status, decision });
  }

  if (kind === "bearer_revoke") {
    const result = await decideBearerRevoke({
      apprId: id,
      decision,
      telegramId: telegram.id,
    });
    if (!result) {
      return badRequest("revoke request not found or already handled");
    }
    return json({ kind: "bearer_revoke_decision", status: result.status, decision });
  }

  if (kind === "account_delete") {
    const result = await decideAccountDeletion({
      apprId: id,
      decision,
      telegram,
      context: requestContext(req),
    });
    if (!result) {
      return badRequest("deletion request not found or already handled");
    }
    return json({ kind: "account_delete_decision", status: result.status, decision });
  }

  return badRequest("unknown decision kind");
}

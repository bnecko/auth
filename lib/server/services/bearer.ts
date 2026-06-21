import type { NextRequest } from "next/server";
import { authBaseUrl, bearerAdminTelegramId } from "../config";
import { publicId, randomToken, safeEqual } from "../crypto";
import { requestContext } from "../http";
import {
  approveBearerRequest,
  clearBearerRequestKey,
  createBearerRequest,
  findBearerRequestByPublicId,
  countPendingBearerRequestsForUser,
  markBearerRequestRevoked,
  readBearerRequestPlaintext,
  rejectBearerRequest,
} from "../repositories/bearerRequests";
import { createExternalApp, setExternalAppStatus } from "../repositories/externalApps";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { sendTelegramMessage } from "../telegramSend";
import { getTelegramQueue } from "../queue";
import {
  beginBearerRevokeApproval,
  getBearerRevokeStatus,
  resolveBearerRevokeApproval,
  setBearerRevokeStatus,
} from "../bearerRevokeChallenge";
import type { BearerRequest, User } from "../types";

export { getBearerRevokeStatus };

const APP_NAME_MAX = 60;
const REASON_MAX = 600;

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  // Append randomness so two requests for the same name don't collide
  // on the unique slug constraint in external_apps.
  return `${base || "app"}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)}`;
}

export async function submitBearerRequest(input: {
  user: User;
  appName: string;
  reason: string;
  req: NextRequest;
}) {
  const appName = input.appName.trim();
  const reason = input.reason.trim();

  if (!appName || appName.length > APP_NAME_MAX) {
    throw new Error(`app name must be 1-${APP_NAME_MAX} characters`);
  }

  if (!reason || reason.length > REASON_MAX) {
    throw new Error(`reason must be 1-${REASON_MAX} characters`);
  }

  const pendingCount = await countPendingBearerRequestsForUser(input.user.id);
  if (pendingCount >= 2) {
    throw new Error("you have too many pending requests, wait for admin review");
  }

  const request = await createBearerRequest({
    publicId: publicId("brq"),
    userId: input.user.id,
    appName,
    reason,
    createdByTelegramId: input.user.telegramId,
  });

  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "bearer_request_submitted",
    result: "ok",
    context: requestContext(input.req),
    metadata: { requestId: request.publicId, appName, telegramId: input.user.telegramId },
  });

  // Best-effort Telegram notification. If sending fails the request is
  // already in the DB and an admin can still approve via the API or by
  // re-triggering a notification; we surface the failure to the caller
  // so the UI can show "submitted but admin not notified".
  try {
    await notifyAdmin({ request, user: input.user });
  } catch (err) {
    await recordSecurityEvent({
      userId: input.user.id,
      eventType: "bearer_request_notify_failed",
      result: err instanceof Error ? err.message : "unknown",
      context: requestContext(input.req),
      metadata: { requestId: request.publicId },
    });
  }

  return request;
}

async function notifyAdmin(input: { request: BearerRequest; user: User }) {
  const adminId = bearerAdminTelegramId();
  if (!adminId) {
    return;
  }

  const userLine = input.user.telegramUsername
    ? `${input.user.firstName} (@${input.user.telegramUsername})`
    : input.user.firstName;

  const text = [
    `Bearer key request`,
    ``,
    `From: ${userLine}`,
    `User: ${input.user.email}`,
    `App: ${input.request.appName}`,
    ``,
    `Reason:`,
    input.request.reason,
    ``,
    `${authBaseUrl()}/admin/bearer/${input.request.publicId}`,
  ].join("\n");

  await getTelegramQueue().add("send", {
    chat_id: adminId,
    text,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Approve", callback_data: `bearer_approve:${input.request.publicId}` },
          { text: "Reject", callback_data: `bearer_reject:${input.request.publicId}` },
        ],
      ],
    },
  });
}

export async function decideBearerRequest(input: {
  publicId: string;
  decision: "approve" | "reject";
  adminTelegramId: string;
  // True only for the in-process admin UI, which has already authenticated and
  // step-up-verified the admin via requireAdminStepUpSession(). Every other
  // caller (the Telegram webhook) leaves this false, so its adminTelegramId is
  // verified against the configured admin id in constant time. There is no
  // string sentinel an external caller can present to skip this check.
  viaAdminUi?: boolean;
}) {
  if (!input.viaAdminUi) {
    const adminId = bearerAdminTelegramId();
    if (!adminId || !safeEqual(input.adminTelegramId, adminId)) {
      throw new Error("not authorized to decide bearer requests");
    }
  }

  const existing = await findBearerRequestByPublicId(input.publicId);
  if (!existing) {
    throw new Error("bearer request not found");
  }

  if (existing.status !== "pending") {
    // Idempotent: replay of an inline-button click should not error.
    return { request: existing, alreadyDecided: true };
  }

  if (input.decision === "reject") {
    const rejected = await rejectBearerRequest(input.publicId, input.adminTelegramId);
    await recordSecurityEvent({
      userId: existing.userId,
      eventType: "bearer_request_rejected",
      result: "ok",
      context: { ip: "", userAgent: "telegram-bot", country: "" },
      metadata: { requestId: input.publicId, adminTelegramId: input.adminTelegramId },
    });
    return { request: rejected || existing, alreadyDecided: false };
  }

  const apiKey = randomToken(32);
  const app = await createExternalApp({
    publicId: publicId("app"),
    name: existing.appName,
    slug: slugify(existing.appName),
    ownerUserId: existing.userId,
    apiKey,
  });

  const approved = await approveBearerRequest({
    publicId: input.publicId,
    externalAppId: app.id,
    plaintextKey: apiKey,
    decidedByTelegramId: input.adminTelegramId,
  });

  if (!approved) {
    // Race: someone decided this between the find and the approve.
    return { request: existing, alreadyDecided: true };
  }

  await recordSecurityEvent({
    userId: existing.userId,
    eventType: "bearer_request_approved",
    result: "ok",
    context: { ip: "", userAgent: "telegram-bot", country: "" },
    metadata: {
      requestId: input.publicId,
      externalAppId: app.publicId,
      adminTelegramId: input.adminTelegramId,
    },
  });

  return { request: approved, alreadyDecided: false };
}

// The repository atomically clears the plaintext as it returns it, so a
// successful reveal both discloses the key and burns it in a single
// statement. The security event records IP/UA so a stolen-cookie
// disclosure leaves a trail in the audit log.
export async function revealBearerKey(
  publicIdValue: string,
  user: User,
  req: NextRequest,
) {
  const plaintext = await readBearerRequestPlaintext(publicIdValue, user.id);
  if (!plaintext) {
    return null;
  }

  await recordSecurityEvent({
    userId: user.id,
    eventType: "bearer_key_revealed",
    result: "ok",
    context: requestContext(req),
    metadata: { requestId: publicIdValue },
  });

  return plaintext;
}

export async function dismissBearerKey(
  publicIdValue: string,
  user: User,
  req: NextRequest,
) {
  const cleared = await clearBearerRequestKey(publicIdValue, user.id);
  if (!cleared) {
    return null;
  }

  await recordSecurityEvent({
    userId: user.id,
    eventType: "bearer_key_cleared",
    result: "ok",
    context: requestContext(req),
    metadata: { requestId: publicIdValue },
  });

  return cleared;
}

// User-initiated revocation, confirmed over Telegram (web alone is not enough).
// The approval is sent to the key creator's Telegram; on approve we disable the
// backing app (the key stops working) and mark the request revoked.
export async function requestBearerRevokeApproval(input: {
  user: User;
  bearerPublicId: string;
  req: NextRequest;
}) {
  const bearer = await findBearerRequestByPublicId(input.bearerPublicId);
  if (!bearer || bearer.userId !== input.user.id) {
    throw new Error("bearer request not found");
  }
  if (bearer.status !== "approved" && bearer.status !== "cleared") {
    throw new Error("this bearer is not active");
  }
  if (!input.user.telegramId) {
    throw new Error("link Telegram before revoking a bearer key");
  }

  const { apprId, browserToken } = await beginBearerRevokeApproval({
    bearerPublicId: bearer.publicId,
    userId: input.user.id,
  });

  await sendTelegramMessage({
    chatId: input.user.telegramId,
    text: [
      "Revoke API bearer key",
      "",
      `App: ${bearer.appName}`,
      "",
      "Do you want to permanently revoke this key? Apps using it will stop working.",
      "",
      "Only approve if you requested this.",
    ].join("\n"),
    inlineButtons: [
      [
        { text: "Approve", callbackData: `bearer_revoke_approve:${apprId}` },
        { text: "Deny", callbackData: `bearer_revoke_deny:${apprId}` },
      ],
    ],
  });

  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "bearer_revoke_request",
    result: "sent",
    context: requestContext(input.req),
    metadata: { requestId: bearer.publicId },
  });

  return { browserToken };
}

export async function decideBearerRevoke(input: {
  apprId: string;
  decision: "approve" | "deny";
  telegramId: string;
}) {
  const appr = await resolveBearerRevokeApproval(input.apprId);
  if (!appr) return null;

  const bearer = await findBearerRequestByPublicId(appr.bearerPublicId);
  // Scope: only the key's creator (by Telegram id) may approve.
  if (!bearer || bearer.createdByTelegramId !== input.telegramId) {
    await setBearerRevokeStatus(appr.browserHash, "denied");
    return null;
  }

  if (input.decision === "deny") {
    await setBearerRevokeStatus(appr.browserHash, "denied");
    await recordSecurityEvent({
      userId: appr.userId,
      eventType: "bearer_revoke_decision",
      result: "denied",
      context: { ip: "", userAgent: "telegram-bot", country: "" },
      metadata: { requestId: bearer.publicId },
    });
    return { status: "denied" as const };
  }

  await markBearerRequestRevoked(bearer.publicId);
  if (bearer.externalAppId) {
    await setExternalAppStatus(bearer.externalAppId, "disabled");
  }
  await setBearerRevokeStatus(appr.browserHash, "revoked");
  await recordSecurityEvent({
    userId: appr.userId,
    eventType: "bearer_revoke_decision",
    result: "revoked",
    context: { ip: "", userAgent: "telegram-bot", country: "" },
    metadata: { requestId: bearer.publicId },
  });
  return { status: "revoked" as const };
}

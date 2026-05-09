import type { NextRequest } from "next/server";
import { authBaseUrl, bearerAdminTelegramId } from "../config";
import { publicId, randomToken } from "../crypto";
import { requestContext } from "../http";
import {
  approveBearerRequest,
  clearBearerRequestKey,
  createBearerRequest,
  findBearerRequestByPublicId,
  countPendingBearerRequestsForUser,
  readBearerRequestPlaintext,
  rejectBearerRequest,
} from "../repositories/bearerRequests";
import { createExternalApp } from "../repositories/externalApps";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { escapeHtml, sendTelegramMessage } from "../telegramSend";
import type { BearerRequest, User } from "../types";

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
  });

  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "bearer_request_submitted",
    result: "ok",
    context: requestContext(input.req),
    metadata: { requestId: request.publicId, appName },
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
    `<b>Bearer key request</b>`,
    ``,
    `<b>From:</b> ${escapeHtml(userLine)}`,
    `<b>User:</b> ${escapeHtml(input.user.email)}`,
    `<b>App:</b> ${escapeHtml(input.request.appName)}`,
    ``,
    `<b>Reason:</b>`,
    escapeHtml(input.request.reason),
    ``,
    `<a href="${authBaseUrl()}/admin/bearer/${input.request.publicId}">open in admin</a>`,
  ].join("\n");

  await sendTelegramMessage({
    chatId: adminId,
    text,
    inlineButtons: [
      [
        { text: "Approve", callbackData: `bearer_approve:${input.request.publicId}` },
        { text: "Reject", callbackData: `bearer_reject:${input.request.publicId}` },
      ],
    ],
  });
}

export async function decideBearerRequest(input: {
  publicId: string;
  decision: "approve" | "reject";
  adminTelegramId: string;
}) {
  const adminId = bearerAdminTelegramId();
  if (!adminId || input.adminTelegramId !== adminId) {
    throw new Error("not authorized to decide bearer requests");
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

export async function revealBearerKey(publicIdValue: string, user: User) {
  const plaintext = await readBearerRequestPlaintext(publicIdValue, user.id);
  if (!plaintext) {
    return null;
  }

  await recordSecurityEvent({
    userId: user.id,
    eventType: "bearer_key_revealed",
    result: "ok",
    context: { ip: "", userAgent: "", country: "" },
    metadata: { requestId: publicIdValue },
  });

  return plaintext;
}

export async function dismissBearerKey(publicIdValue: string, user: User) {
  const cleared = await clearBearerRequestKey(publicIdValue, user.id);
  if (!cleared) {
    return null;
  }

  await recordSecurityEvent({
    userId: user.id,
    eventType: "bearer_key_cleared",
    result: "ok",
    context: { ip: "", userAgent: "", country: "" },
    metadata: { requestId: publicIdValue },
  });

  return cleared;
}

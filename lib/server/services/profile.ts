import redis from "../redis";
import { normalizeIdentifier, publicId, randomToken } from "../crypto";
import { type RequestContext } from "../http";
import { verifyPassword } from "../password";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { sendTelegramMessage } from "../telegramSend";
import {
  applyEmailChange,
  applyUsernameChange,
  emailExists,
  findPasswordHashById,
  findUserById,
  updateUserProfile,
  usernameExists,
} from "../repositories/users";
import {
  createProfileChangeRequest,
  findPendingProfileChangeRequest,
  markProfileChangeApproved,
  markProfileChangeDenied,
  type ProfileChangeField,
} from "../repositories/profileChanges";
import { parseProfileEdit, validateIdentityField } from "../validation";
import type { TelegramIdentity, User } from "../types";

const TTL = 600; // 10 minutes, matching the relink flow
const APPR_KEY = (apprId: string) => `profile:appr:${apprId}`;

export async function updateProfile(input: {
  user: User;
  body: Record<string, unknown>;
  context: RequestContext;
}) {
  const { input: fields, errors } = parseProfileEdit(input.body);
  const firstError = Object.values(errors)[0];
  if (firstError) {
    throw new Error(firstError);
  }
  const updated = await updateUserProfile(input.user.id, {
    firstName: fields.firstName,
    bio: fields.bio,
    avatarPreset: fields.avatarPreset,
  });
  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "profile_updated",
    result: "ok",
    context: input.context,
  });
  return updated;
}

// Username/email changes are gated by current-password step-up AND a Telegram
// Approve/Deny, so a stolen session alone cannot rewrite someone's identity.
export async function requestProfileChange(input: {
  user: User;
  field: ProfileChangeField;
  newValue: string;
  currentPassword: string;
  context: RequestContext;
}) {
  if (!input.user.telegramId) {
    throw new Error("link Telegram before changing your username or email");
  }

  const creds = await findPasswordHashById(input.user.id);
  if (!creds || !(await verifyPassword(input.currentPassword, creds.password_hash))) {
    await recordSecurityEvent({
      userId: input.user.id,
      eventType: "profile_change_request",
      result: "invalid_password",
      context: input.context,
      metadata: { field: input.field },
    });
    throw new Error("current password is incorrect");
  }

  const newValue = input.newValue.trim();
  const fieldError = validateIdentityField(input.field, newValue);
  if (fieldError) {
    throw new Error(fieldError);
  }

  const taken =
    input.field === "username" ? await usernameExists(newValue) : await emailExists(newValue);
  if (taken) {
    throw new Error(`that ${input.field} is already taken`);
  }

  const request = await createProfileChangeRequest({
    publicId: publicId("pcr"),
    userId: input.user.id,
    field: input.field,
    newValue,
    newValueNormalized: normalizeIdentifier(newValue),
    ip: input.context.ip,
    userAgent: input.context.userAgent,
    expiresAt: new Date(Date.now() + TTL * 1000),
  });

  const apprId = randomToken(12);
  await redis.setex(APPR_KEY(apprId), TTL, request.publicId);

  await sendTelegramMessage({
    chatId: input.user.telegramId,
    text: [
      "Confirm account change",
      "",
      `Change your ${input.field} to:`,
      newValue,
      "",
      "Do you want to apply this change?",
      "",
      "Only approve if you requested this. Never approve a change you didn't start.",
    ].join("\n"),
    inlineButtons: [
      [
        { text: "Approve", callbackData: `profile_approve:${apprId}` },
        { text: "Deny", callbackData: `profile_deny:${apprId}` },
      ],
    ],
  });

  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "profile_change_request",
    result: "sent",
    context: input.context,
    metadata: { field: input.field, requestId: request.publicId },
  });

  return request;
}

export async function decideProfileChange(input: {
  apprId: string;
  decision: "approve" | "deny";
  telegram: TelegramIdentity;
  context: RequestContext;
}) {
  const requestPublicId = await redis.get(APPR_KEY(input.apprId));
  if (!requestPublicId) return null;

  const request = await findPendingProfileChangeRequest(requestPublicId);
  if (!request) {
    await redis.del(APPR_KEY(input.apprId));
    return null;
  }

  // Scope: the approving Telegram account must own the request's user.
  const owner = await findUserById(request.userId);
  if (!owner || owner.telegramId !== input.telegram.id) {
    return null;
  }

  await redis.del(APPR_KEY(input.apprId));

  if (input.decision === "deny") {
    await markProfileChangeDenied(request.publicId);
    await recordSecurityEvent({
      userId: request.userId,
      eventType: "profile_change_decision",
      result: "denied",
      context: input.context,
      metadata: { field: request.field },
    });
    return { status: "denied" as const, field: request.field };
  }

  const applied =
    request.field === "username"
      ? await applyUsernameChange(request.userId, request.newValue)
      : await applyEmailChange(request.userId, request.newValue);

  if (!applied) {
    // Lost the uniqueness race between request and approval.
    await markProfileChangeDenied(request.publicId);
    await recordSecurityEvent({
      userId: request.userId,
      eventType: "profile_change_decision",
      result: "conflict",
      context: input.context,
      metadata: { field: request.field },
    });
    return { status: "conflict" as const, field: request.field };
  }

  await markProfileChangeApproved(request.publicId);
  await recordSecurityEvent({
    userId: request.userId,
    eventType: "profile_change_decision",
    result: "applied",
    context: input.context,
    metadata: { field: request.field },
  });
  return { status: "applied" as const, field: request.field };
}

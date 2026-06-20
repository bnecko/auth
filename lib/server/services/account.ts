import type { NextRequest } from "next/server";
import { requestContext, type RequestContext } from "../http";
import { verifyPassword } from "../password";
import { sendTelegramMessage } from "../telegramSend";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { revokeSessionsForUser } from "../repositories/sessions";
import { revokeAllOAuthTokensForUser } from "../repositories/oauth";
import {
  findPasswordHashById,
  findUserById,
  scheduleAccountDeletion,
} from "../repositories/users";
import {
  beginAccountDeleteApproval,
  resolveAccountDeleteApproval,
  setAccountDeleteStatus,
  getAccountDeleteStatus,
} from "../accountDeleteChallenge";
import type { TelegramIdentity, User } from "../types";

export { getAccountDeleteStatus };

const GRACE_DAYS = Number(process.env.DELETION_GRACE_DAYS || 30);

// Start a deletion: re-verify the current password, then hand off to Telegram
// for Approve/Deny. Nothing is scheduled until the user taps Approve. Matches
// the username/email-change gate (password step-up AND Telegram).
export async function requestAccountDeletion(input: {
  user: User;
  currentPassword: string;
  req: NextRequest;
}) {
  if (!input.user.telegramId) {
    throw new Error("link Telegram before deleting your account");
  }

  const creds = await findPasswordHashById(input.user.id);
  if (!creds || !(await verifyPassword(input.currentPassword, creds.password_hash))) {
    await recordSecurityEvent({
      userId: input.user.id,
      eventType: "account_delete_request",
      result: "invalid_password",
      context: requestContext(input.req),
    });
    throw new Error("current password is incorrect");
  }

  const { apprId, browserToken } = await beginAccountDeleteApproval({
    userId: input.user.id,
  });

  await sendTelegramMessage({
    chatId: input.user.telegramId,
    text: [
      "Delete your account",
      "",
      `If you approve, your account is scheduled for deletion in ${GRACE_DAYS} days.`,
      "You can cancel any time before then by signing in.",
      "",
      "Only approve if you requested this. Never approve a deletion you didn't start.",
    ].join("\n"),
    inlineButtons: [
      [
        { text: "Approve deletion", callbackData: `account_delete_approve:${apprId}` },
        { text: "Deny", callbackData: `account_delete_deny:${apprId}` },
      ],
    ],
  });

  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "account_delete_request",
    result: "sent",
    context: requestContext(input.req),
  });

  return { browserToken };
}

// Telegram decision callback. On approve: schedule the soft delete and sign the
// user out everywhere. The grace-period purge runs in the worker; signing in
// before then cancels it (clearAccountDormancy in createUserSession).
export async function decideAccountDeletion(input: {
  apprId: string;
  decision: "approve" | "deny";
  telegram: TelegramIdentity;
  context: RequestContext;
}) {
  const appr = await resolveAccountDeleteApproval(input.apprId);
  if (!appr) return null;

  const owner = await findUserById(appr.userId);
  // Scope: the approving Telegram account must own the request.
  if (!owner || owner.telegramId !== input.telegram.id) {
    await setAccountDeleteStatus(appr.browserHash, "denied");
    return null;
  }

  if (input.decision === "deny") {
    await setAccountDeleteStatus(appr.browserHash, "denied");
    await recordSecurityEvent({
      userId: appr.userId,
      eventType: "account_delete_decision",
      result: "denied",
      context: input.context,
    });
    return { status: "denied" as const };
  }

  await scheduleAccountDeletion(appr.userId);
  await revokeSessionsForUser(appr.userId);
  await revokeAllOAuthTokensForUser(appr.userId);
  await setAccountDeleteStatus(appr.browserHash, "scheduled");
  await recordSecurityEvent({
    userId: appr.userId,
    eventType: "account_delete_decision",
    result: "scheduled",
    context: input.context,
    metadata: { graceDays: GRACE_DAYS },
  });
  return { status: "scheduled" as const };
}

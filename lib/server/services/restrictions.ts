import { publicId, randomToken } from "../crypto";
import { type RequestContext } from "../http";
import { getTelegramQueue } from "../queue";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { revokeSessionsForUser } from "../repositories/sessions";
import { revokeAllOAuthTokensForUser } from "../repositories/oauth";
import { findUserById } from "../repositories/users";
import {
  createSupportMessage,
  createSupportThread,
  findSupportThreadById,
  listSupportMessages,
} from "../repositories/support";
import {
  createRestriction,
  findActiveRestrictionForUser,
  liftRestriction,
  listActiveRestrictions,
  touchRestrictionActivity,
} from "../repositories/restrictions";
import {
  findSuspicionEvent,
  listSuspicionQueue,
  recordSuspicionEvent,
  setSuspicionStatus,
} from "../repositories/suspicion";
import type { User } from "../types";

// Human-facing trigger code prefixes. Extend as new heuristics are added.
const TRIGGER_ABBR: Record<string, string> = {
  manual: "MAN",
  ip_velocity: "IPVEL",
  geo_anomaly: "GEO",
  login_bruteforce: "BRUTE",
  registration_burst: "REGB",
};

function makeTriggerCode(triggerType: string) {
  const abbr = TRIGGER_ABBR[triggerType] || "GEN";
  const suffix = randomToken(5).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return `SA-${abbr}-${suffix}`;
}

// The single detection seam: heuristics (and, later, an AI scorer) call this to
// enqueue a review. It only populates the queue - a human decides to restrict.
export async function detectSuspicion(input: {
  userId: number | null;
  triggerType: string;
  score: number;
  reasons: string[];
}) {
  await recordSuspicionEvent({
    publicId: publicId("sus"),
    userId: input.userId,
    triggerType: input.triggerType,
    score: input.score,
    reasons: input.reasons,
  });
}

export async function listReviewQueue() {
  return listSuspicionQueue();
}

export async function listRestrictions() {
  return listActiveRestrictions();
}

// Restrict a user: open a private security thread, set the flag, kill their
// sessions + OAuth tokens, and notify them on Telegram with priority.
export async function restrictUser(input: {
  targetUserId: number;
  triggerType: string;
  reason: string | null;
  actor: User;
  suspicionEventPublicId?: string | null;
  context: RequestContext;
}) {
  if (input.targetUserId === input.actor.id) {
    throw new Error("you cannot restrict yourself");
  }
  const target = await findUserById(input.targetUserId);
  if (!target) {
    throw new Error("user not found");
  }
  if (target.role === "admin") {
    throw new Error("admins cannot be restricted");
  }
  const existing = await findActiveRestrictionForUser(target.id);
  if (existing) {
    return existing;
  }

  const triggerCode = makeTriggerCode(input.triggerType);
  const thread = await createSupportThread({
    publicId: publicId("sup"),
    kind: "security",
    visibility: "private",
    authorUserId: target.id,
    title: `Account restricted (${triggerCode})`,
    body:
      input.reason ||
      "Your account has been restricted pending a security review. Reply here to reach the security team.",
  });

  let suspicionEventId: number | null = null;
  if (input.suspicionEventPublicId) {
    const ev = await findSuspicionEvent(input.suspicionEventPublicId);
    suspicionEventId = ev?.id ?? null;
    await setSuspicionStatus({
      publicId: input.suspicionEventPublicId,
      status: "actioned",
      reviewedByUserId: input.actor.id,
    });
  }

  const restriction = await createRestriction({
    publicId: publicId("rst"),
    userId: target.id,
    triggerType: input.triggerType,
    triggerCode,
    reason: input.reason,
    securityThreadId: thread.id,
    suspicionEventId,
    restrictedByUserId: input.actor.id,
  });

  await revokeSessionsForUser(target.id);
  await revokeAllOAuthTokensForUser(target.id);

  await recordSecurityEvent({
    userId: target.id,
    eventType: "account_restricted",
    result: input.triggerType,
    context: input.context,
    metadata: { triggerCode, actor: input.actor.publicId },
  });

  if (target.telegramId) {
    await getTelegramQueue().add(
      "send",
      {
        chat_id: target.telegramId,
        text: [
          "Account restricted",
          "",
          `Reference: ${triggerCode}`,
          "",
          "Your Bottleneck account has been restricted pending a security review. Sign in to read the details and reply to the security team.",
        ].join("\n"),
      },
      { priority: 1 },
    );
  }

  return restriction;
}

export async function unrestrictUser(input: {
  restrictionPublicId: string;
  actor: User;
  context: RequestContext;
}) {
  const userId = await liftRestriction(input.restrictionPublicId);
  if (userId == null) {
    throw new Error("restriction not found or already lifted");
  }
  await recordSecurityEvent({
    userId,
    eventType: "account_unrestricted",
    result: "ok",
    context: input.context,
    metadata: { actor: input.actor.publicId },
  });
  const target = await findUserById(userId);
  if (target?.telegramId) {
    await getTelegramQueue().add("send", {
      chat_id: target.telegramId,
      text: "Restriction lifted\n\nYour Bottleneck account access has been restored.",
    });
  }
}

// The restricted user's own view: their restriction + the security conversation
// (internal staff notes are hidden).
export async function getRestrictedView(user: User) {
  const restriction = await findActiveRestrictionForUser(user.id);
  if (!restriction || restriction.securityThreadId == null) {
    return null;
  }
  const messages = await listSupportMessages({
    threadId: restriction.securityThreadId,
    includeInternal: false,
  });
  return { restriction, messages };
}

export async function postRestrictedReply(input: {
  user: User;
  body: string;
  context: RequestContext;
}) {
  const body = input.body.trim();
  if (!body || body.length > 4000) {
    throw new Error("message must be 1-4000 characters");
  }
  const restriction = await findActiveRestrictionForUser(input.user.id);
  if (!restriction || restriction.securityThreadId == null) {
    throw new Error("no active restriction");
  }
  await createSupportMessage({
    publicId: publicId("smg"),
    threadId: restriction.securityThreadId,
    authorUserId: input.user.id,
    body,
    internal: false,
  });
  // Resets the 60-day inactivity clock.
  await touchRestrictionActivity(restriction.id);
}

// Security-team view of one restriction's thread (includes internal notes).
export async function getRestrictionForReview(restrictionPublicId: string) {
  const all = await listActiveRestrictions(500);
  const restriction = all.find(r => r.publicId === restrictionPublicId);
  if (!restriction || restriction.securityThreadId == null) {
    return null;
  }
  const thread = await findSupportThreadById(restriction.securityThreadId);
  const messages = await listSupportMessages({
    threadId: restriction.securityThreadId,
    includeInternal: true,
  });
  return { restriction, thread, messages };
}

export async function postSecurityReply(input: {
  actor: User;
  threadId: number;
  body: string;
  internal: boolean;
  context: RequestContext;
}) {
  const body = input.body.trim();
  if (!body || body.length > 4000) {
    throw new Error("message must be 1-4000 characters");
  }
  await createSupportMessage({
    publicId: publicId("smg"),
    threadId: input.threadId,
    authorUserId: input.actor.id,
    body,
    internal: input.internal,
  });
}

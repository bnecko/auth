import type { NextRequest } from "next/server";
import redis from "../redis";
import { assessRequestRisk } from "../risk";
import { login2faTtlMinutes, registrationTtlMinutes } from "../config";
import {
  hashToken,
  normalizeIdentifier,
  publicId,
  randomToken,
  telegramStartToken,
} from "../crypto";
import { requestContext, type RequestContext } from "../http";
import { hashPassword, verifyPassword } from "../password";
import {
  bumpFailureCount,
  clearFailureCount,
  readFailureCount,
} from "../rateLimit";
import { notifyUser } from "../notifications";
import {
  completeRegistrationRequest,
  createRegistrationRequest,
  findPendingRegistrationByStartToken,
  findRegistrationRequest,
  markRegistrationDenied,
  markRegistrationVerified,
} from "../repositories/registrationRequests";
import { beginRelinkApproval, decideRelink } from "../relinkChallenge";
import { isTelegramIdBanned } from "../repositories/bans";
import { recordSuspicionEvent } from "../repositories/suspicion";
import {
  completeLoginChallenge,
  createLoginChallenge,
  findLoginChallenge,
  findPendingLoginChallengeByStartToken,
  markLoginChallengeDenied,
  markLoginChallengeVerified,
} from "../repositories/loginChallenges";
import { sendTelegramMessage } from "../telegramSend";
import {
  countRecentEventsByIp,
  recordSecurityEvent,
} from "../repositories/securityEvents";
import {
  createUser,
  findPasswordHash,
  findPasswordHashById,
  findUserById,
  findUserByTelegramId,
  updateUserPassword,
  usernameOrEmailExists,
} from "../repositories/users";
import { revokeOtherSessionsForUser } from "../repositories/sessions";
import { verifyTurnstile } from "../turnstile";
import { verifyTelegramLogin } from "../telegram";
import type { TelegramIdentity, User } from "../types";
import type { LoginInput, RegistrationInput } from "../validation";

export type RegisterResult =
  | {
      kind: "created";
      user: User;
    }
  | {
      kind: "pending_telegram";
      verificationId: string;
      startToken: string;
      expiresAt: string;
    };

export async function registerUser(
  input: RegistrationInput,
  req: NextRequest,
  telegramPayload?: Record<string, string | number | undefined>,
): Promise<RegisterResult> {
  const context = requestContext(req);
  const rateLimitKey = `rate_limit:register_attempt:${context.ip || "unknown"}`;
  
  const attempts = context.ip ? Number(await redis.get(rateLimitKey)) || 0 : 0;

  if (attempts >= REGISTER_ATTEMPT_HARD_LIMIT) {
    await recordSecurityEvent({
      eventType: "register_attempt",
      result: "rate_limited",
      context,
    });
    throw new Error("too many attempts, try again later");
  }

  if (context.ip) {
    await redis.multi().incr(rateLimitKey).expire(rateLimitKey, REGISTER_ATTEMPT_WINDOW_MINUTES * 60).exec();
  }

  const turnstileOk = await verifyTurnstile(input.turnstileToken, context.ip);

  if (!turnstileOk) {
    await recordSecurityEvent({
      eventType: "register_attempt",
      result: "turnstile_failed",
      context,
    });
    throw new Error("verification failed");
  }

  if (await usernameOrEmailExists(input.username, input.email)) {
    await recordSecurityEvent({
      eventType: "register_attempt",
      result: "duplicate",
      context,
      metadata: { username: input.username },
    });
    throw new Error("username or email unavailable");
  }

  const passwordHash = await hashPassword(input.password);
  const telegram = telegramPayload ? verifyTelegramLogin(telegramPayload) : null;

  if (telegram) {
    if (await findUserByTelegramId(telegram.id)) {
      throw new Error("telegram account already linked");
    }

    const user = await createUser({
      publicId: publicId("usr"),
      firstName: input.firstName,
      username: input.username,
      bio: input.bio,
      email: input.email,
      dob: input.dob,
      passwordHash,
      telegram,
    });

    await recordSecurityEvent({
      userId: user.id,
      eventType: "register_attempt",
      result: "created",
      context,
    });

    return { kind: "created", user };
  }

  const startToken = telegramStartToken();
  const expiresAt = new Date(Date.now() + registrationTtlMinutes() * 60_000);
  const request = await createRegistrationRequest({
    publicId: publicId("reg"),
    firstName: input.firstName,
    username: input.username,
    bio: input.bio,
    email: input.email,
    dob: input.dob,
    passwordHash,
    startTokenHash: hashToken(startToken),
    ip: context.ip,
    userAgent: context.userAgent,
    expiresAt,
  });

  await recordSecurityEvent({
    eventType: "register_attempt",
    result: "pending_telegram",
    context,
    metadata: { requestId: request.publicId },
  });

  return {
    kind: "pending_telegram",
    verificationId: request.publicId,
    startToken,
    expiresAt: request.expiresAt,
  };
}

// Pre-computed scrypt hash of a random throwaway password used to
// equalize login timing for unknown identifiers. The cost parameters
// match the defaults in lib/server/password.ts so a verifyPassword call
// against this value takes roughly the same amount of CPU as a real
// verification. The salt and hash are random; nothing here authenticates
// a real account.
const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$LOfuL5Js1gMmgd5fmNLLpw$-eyiwUeTU103yza20v-uLYzbSWAPFPNbO7cWbCWYT2To37kJMpKTMC2bJd5-ELmcWsGPiNvkZT-DCJBX9V4f4A";

// After this many login_failure events from the same IP within the rate
// window we hard-block further attempts and surface a generic error
// instead of relying solely on a Turnstile gate. Turnstile alone is
// bypassable (the Turnstile module fails open without a configured
// secret) and Cloudflare Turnstile farms do exist; a hard limit forces
// attackers to rotate IPs.
const LOGIN_FAILURE_HARD_LIMIT = 30;
const LOGIN_FAILURE_WINDOW_MINUTES = 15;

// Per-account lockout, independent of the per-IP gate above. A distributed
// attacker rotating IPs is throttled per IP but could still grind a single
// account; once this many failures land on one resolved user the account is
// temporarily locked (auto-expires) and the user is alerted once. Keyed on
// the resolved user id (not the raw identifier) so spraying an unknown
// identifier cannot lock anyone out. Cleared on a successful login.
const ACCOUNT_FAILURE_HARD_LIMIT = 10;
const ACCOUNT_FAILURE_WINDOW_MINUTES = 60;

const REGISTER_ATTEMPT_HARD_LIMIT = 5;
const REGISTER_ATTEMPT_WINDOW_MINUTES = 15;

export async function loginUser(input: LoginInput, req: NextRequest) {
  const context = requestContext(req);
  const ipKey = `rate_limit:login_failure:${context.ip || "unknown"}`;
  const ipWindow = LOGIN_FAILURE_WINDOW_MINUTES * 60;
  const accountWindow = ACCOUNT_FAILURE_WINDOW_MINUTES * 60;

  const ipFailures = context.ip ? await readFailureCount(ipKey) : 0;
  if (ipFailures >= LOGIN_FAILURE_HARD_LIMIT) {
    await recordSecurityEvent({
      eventType: "login_failure",
      result: "rate_limited",
      context,
    });
    throw new Error("too many attempts, try again later");
  }

  const turnstileOk = await verifyTurnstile(input.turnstileToken, context.ip);
  if (!turnstileOk) {
    await recordSecurityEvent({
      eventType: "login_failure",
      result: "turnstile_failed",
      context,
    });
    throw new Error("verification failed");
  }

  const bumpIp = async () => {
    if (context.ip) {
      await bumpFailureCount(ipKey, ipWindow);
    }
  };

  const credentials = await findPasswordHash(input.identifier);
  if (!credentials) {
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
    await recordSecurityEvent({
      eventType: "login_failure",
      result: "invalid",
      context,
    });
    await bumpIp();
    throw new Error("invalid credentials");
  }

  const userId = Number(credentials.id);
  const userKey = `rate_limit:login_failure:user:${userId}`;

  if (credentials.status === "banned") {
    await recordSecurityEvent({
      userId,
      eventType: "login_failure",
      result: "banned",
      context,
    });
    throw new Error("account banned");
  }

  if ((await readFailureCount(userKey)) >= ACCOUNT_FAILURE_HARD_LIMIT) {
    await recordSecurityEvent({
      userId,
      eventType: "login_failure",
      result: "rate_limited_user",
      context,
    });
    throw new Error("too many attempts, try again later");
  }

  const valid = await verifyPassword(input.password, credentials.password_hash);
  if (!valid) {
    await recordSecurityEvent({
      userId,
      eventType: "login_failure",
      result: "invalid",
      context,
    });
    await bumpIp();
    const userFailures = await bumpFailureCount(userKey, accountWindow);
    // Alert exactly once, on the attempt that trips the lock (atomic INCR
    // means only one concurrent caller sees the boundary value), rather than
    // on every subsequent locked attempt.
    if (userFailures === ACCOUNT_FAILURE_HARD_LIMIT) {
      await notifyUser(userId, { type: "login_failure_threshold" });
    }
    throw new Error("invalid credentials");
  }

  const user = await findUserById(userId);
  if (!user) {
    throw new Error("invalid credentials");
  }

  await clearFailureCount(userKey);
  if (context.ip) {
    await clearFailureCount(ipKey);
  }

  await recordSecurityEvent({
    userId: user.id,
    eventType: "login_success",
    result: "ok",
    context,
  });
  const risk = await assessRequestRisk({
    userId: user.id,
    eventType: "login_success",
    context,
  });
  // Detection seam: a high-risk sign-in enqueues a review for the security team
  // (queue-only; a human decides whether to restrict). An AI scorer could later
  // replace this trigger without touching callers.
  if (risk.result === "high") {
    await recordSuspicionEvent({
      publicId: publicId("sus"),
      userId: user.id,
      triggerType: "login_anomaly",
      score: risk.score,
      reasons: risk.reasons,
    });
  }

  return user;
}

// Authenticated password change from the security center. Requires the
// current password, validates the new one, rotates the hash, and signs out
// every other session so a change after a suspected compromise actually
// evicts the attacker. Best-effort Telegram notification on success.
export async function changePasswordForUser(input: {
  userId: number;
  currentPassword: string;
  newPassword: string;
  currentSessionId: number;
  context: RequestContext;
}) {
  const credentials = await findPasswordHashById(input.userId);
  if (!credentials) {
    throw new Error("account not found");
  }

  const valid = await verifyPassword(input.currentPassword, credentials.password_hash);
  if (!valid) {
    await recordSecurityEvent({
      userId: input.userId,
      eventType: "password_change",
      result: "invalid_current",
      context: input.context,
    });
    throw new Error("current password is incorrect");
  }

  if (input.newPassword.length < 10 || input.newPassword.length > 256) {
    throw new Error("new password must be 10-256 characters");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await updateUserPassword(input.userId, passwordHash);
  await revokeOtherSessionsForUser({
    userId: input.userId,
    currentSessionId: input.currentSessionId,
  });
  await recordSecurityEvent({
    userId: input.userId,
    eventType: "password_change",
    result: "ok",
    context: input.context,
  });
  await notifyUser(input.userId, { type: "password_changed" });
}

export async function createTelegramLoginChallenge(
  user: User,
  remember: boolean,
  req: NextRequest,
) {
  if (!user.telegramId) {
    throw new Error("telegram account is not linked");
  }

  const context = requestContext(req);
  const startToken = telegramStartToken();
  const browserToken = randomToken();
  const expiresAt = new Date(Date.now() + login2faTtlMinutes() * 60_000);
  const challenge = await createLoginChallenge({
    publicId: publicId("tlg"),
    userId: user.id,
    startToken,
    browserToken,
    remember,
    ip: context.ip,
    userAgent: context.userAgent,
    expiresAt,
  });

  await recordSecurityEvent({
    userId: user.id,
    eventType: "login_2fa_required",
    result: "pending",
    context,
    metadata: { challengeId: challenge.publicId },
  });

  return {
    challenge,
    startToken,
    browserToken,
  };
}

export async function getTelegramLoginChallenge(publicIdValue: string) {
  const challenge = await findLoginChallenge(publicIdValue);
  if (!challenge) {
    return null;
  }

  const expired = Date.parse(challenge.expiresAt) <= Date.now();
  return {
    status: expired && challenge.status === "pending" ? "expired" : challenge.status,
    expiresAt: challenge.expiresAt,
  };
}

export async function requestTelegramLoginApproval(
  startToken: string,
  telegram: TelegramIdentity,
  req: NextRequest,
) {
  const context = requestContext(req);
  if (await isTelegramIdBanned(telegram.id)) {
    await recordSecurityEvent({
      eventType: "login_2fa_prompt",
      result: "telegram_banned",
      context,
      metadata: { telegramId: telegram.id },
    });
    return null;
  }
  const challenge = await findPendingLoginChallengeByStartToken({
    startToken,
    telegramId: telegram.id,
  });

  if (!challenge) {
    return null;
  }

  // Don't auto-verify: ask the account owner to approve this specific login
  // attempt (showing the originating IP) via inline buttons.
  await sendTelegramMessage({
    chatId: telegram.id,
    text: [
      "🔐 New login attempt",
      "",
      `User: ${challenge.username || "your account"}`,
      `IP: ${challenge.ip || "unknown"}`,
      "",
      "Do you want to approve this sign-in?",
      "",
      "Only approve if this is you. Never approve a sign-in - or a Telegram link - for anyone else.",
    ].join("\n"),
    inlineButtons: [
      [
        { text: "Approve", callbackData: `login_approve:${challenge.publicId}` },
        { text: "Deny", callbackData: `login_deny:${challenge.publicId}` },
      ],
    ],
  });

  await recordSecurityEvent({
    userId: challenge.userId,
    eventType: "login_2fa_prompt",
    result: "sent",
    context,
    metadata: { challengeId: challenge.publicId, telegramId: telegram.id },
  });

  return challenge;
}

export async function decideTelegramLogin(input: {
  challengeId: string;
  decision: "approve" | "deny";
  telegramId: string;
  req: NextRequest;
}) {
  const context = requestContext(input.req);
  const challenge =
    input.decision === "approve"
      ? await markLoginChallengeVerified({
          publicId: input.challengeId,
          telegramId: input.telegramId,
        })
      : await markLoginChallengeDenied({
          publicId: input.challengeId,
          telegramId: input.telegramId,
        });

  if (!challenge) {
    return null;
  }

  await recordSecurityEvent({
    userId: challenge.userId,
    eventType: "login_2fa_decision",
    result: input.decision === "approve" ? "verified" : "denied",
    context,
    metadata: { challengeId: challenge.publicId, telegramId: input.telegramId },
  });

  return challenge;
}

export async function completeTelegramLoginChallenge(
  publicIdValue: string,
  browserToken: string,
  req: NextRequest,
) {
  const context = requestContext(req);
  const challenge = await completeLoginChallenge({
    publicId: publicIdValue,
    browserToken,
  });

  if (!challenge) {
    await recordSecurityEvent({
      eventType: "login_2fa_failure",
      result: "invalid_or_expired",
      context,
      metadata: { challengeId: publicIdValue },
    });
    throw new Error("verification is not complete");
  }

  const user = await findUserById(challenge.userId);
  if (!user || user.status === "banned") {
    throw new Error("account unavailable");
  }

  await recordSecurityEvent({
    userId: user.id,
    eventType: "login_success",
    result: "telegram_2fa",
    context,
    metadata: { challengeId: publicIdValue },
  });

  return {
    user,
    remember: challenge.remember,
  };
}

// Registration via Telegram now mirrors login: the bot seeing a valid /start
// token does NOT create the account. We send the user an Approve/Deny prompt
// and only mark the request verified once they confirm. Returns null when the
// token doesn't match a pending registration (so the route can try other flows
// or report the link invalid).
export async function requestTelegramRegistrationApproval(
  startToken: string,
  telegram: TelegramIdentity,
  req: NextRequest,
) {
  const context = requestContext(req);
  // Block a banned Telegram identity from completing a fresh registration -
  // this is the recreation-evasion guard.
  if (await isTelegramIdBanned(telegram.id)) {
    await recordSecurityEvent({
      eventType: "telegram_verify_prompt",
      result: "telegram_banned",
      context,
      metadata: { telegramId: telegram.id },
    });
    return null;
  }
  const request = await findPendingRegistrationByStartToken(hashToken(startToken));
  if (!request) {
    return null;
  }

  await sendTelegramMessage({
    chatId: telegram.id,
    text: [
      "Complete registration",
      "",
      `User: ${request.username}`,
      `IP: ${request.ip || "unknown"}`,
      "",
      "Do you want to link this Telegram account and finish signing up?",
      "",
      "Only approve if this is you. Never link your Telegram to someone else's account.",
    ].join("\n"),
    inlineButtons: [
      [
        { text: "Approve", callbackData: `reg_approve:${request.publicId}` },
        { text: "Deny", callbackData: `reg_deny:${request.publicId}` },
      ],
    ],
  });

  await recordSecurityEvent({
    eventType: "telegram_verify_prompt",
    result: "sent",
    context,
    metadata: { requestId: request.publicId, telegramId: telegram.id },
  });

  return request;
}

export async function decideTelegramRegistration(input: {
  publicId: string;
  decision: "approve" | "deny";
  telegram: TelegramIdentity;
  req: NextRequest;
}) {
  const context = requestContext(input.req);
  const request =
    input.decision === "approve"
      ? await markRegistrationVerified(input.publicId, input.telegram)
      : await markRegistrationDenied(input.publicId);

  if (!request) {
    return null;
  }

  await recordSecurityEvent({
    eventType: "telegram_verify_decision",
    result: input.decision === "approve" ? "verified" : "denied",
    context,
    metadata: { requestId: request.publicId, telegramId: input.telegram.id },
  });

  return request;
}

// Relink via Telegram, same approve/deny shape. beginRelinkApproval validates
// the /start token and mints a short handle; the decision endpoint completes or
// cancels the relink via decideRelink. Returns null for an unknown token.
export async function requestTelegramRelinkApproval(
  startToken: string,
  telegram: TelegramIdentity,
  req: NextRequest,
) {
  const context = requestContext(req);
  if (await isTelegramIdBanned(telegram.id)) {
    await recordSecurityEvent({
      eventType: "telegram_relink_prompt",
      result: "telegram_banned",
      context,
      metadata: { telegramId: telegram.id },
    });
    return null;
  }
  const approval = await beginRelinkApproval(startToken);
  if (!approval) {
    return null;
  }

  const user = await findUserById(approval.userId);

  await sendTelegramMessage({
    chatId: telegram.id,
    text: [
      "Link Telegram account",
      "",
      `Account: ${user?.username || "your account"}`,
      "",
      "Do you want to link this Telegram account?",
      "",
      "Only approve if this is your account. Never link your Telegram to someone else's account.",
    ].join("\n"),
    inlineButtons: [
      [
        { text: "Approve", callbackData: `relink_approve:${approval.apprId}` },
        { text: "Deny", callbackData: `relink_deny:${approval.apprId}` },
      ],
    ],
  });

  await recordSecurityEvent({
    userId: approval.userId,
    eventType: "telegram_relink_prompt",
    result: "sent",
    context,
    metadata: { telegramId: telegram.id },
  });

  return approval;
}

export async function decideTelegramRelink(input: {
  apprId: string;
  decision: "approve" | "deny";
  telegram: TelegramIdentity;
  req: NextRequest;
}) {
  const context = requestContext(input.req);
  const result = await decideRelink({
    apprId: input.apprId,
    decision: input.decision,
    telegram: input.telegram,
  });

  if (!result) {
    return null;
  }

  await recordSecurityEvent({
    userId: result.userId,
    eventType: "telegram_2fa_relink",
    result: result.status,
    context,
    metadata: { telegramId: input.telegram.id },
  });

  return result;
}

export async function completeVerifiedRegistration(
  verificationId: string,
  req: NextRequest,
) {
  const context = requestContext(req);
  const request = await findRegistrationRequest(verificationId);

  if (!request || request.status !== "verified") {
    throw new Error("registration is not verified");
  }

  if (request.userId) {
    const existing = await findUserById(request.userId);
    if (existing) {
      return existing;
    }
  }

  if (!request.telegramId) {
    throw new Error("telegram verification missing");
  }

  const telegram: TelegramIdentity = {
    id: request.telegramId,
    firstName: request.firstName,
    username: request.telegramUsername,
  };

  const user = await createUser({
    publicId: publicId("usr"),
    firstName: request.firstName,
    username: normalizeIdentifier(request.username),
    bio: request.bio,
    email: normalizeIdentifier(request.email),
    dob: request.dob,
    passwordHash: request.passwordHash,
    telegram,
  });

  await completeRegistrationRequest(request.publicId, user.id);
  await recordSecurityEvent({
    userId: user.id,
    eventType: "register_attempt",
    result: "created_after_telegram",
    context,
  });

  return user;
}

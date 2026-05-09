import type { NextRequest } from "next/server";
import { login2faTtlMinutes, registrationTtlMinutes } from "../config";
import {
  hashToken,
  normalizeIdentifier,
  publicId,
  randomToken,
  telegramStartToken,
} from "../crypto";
import { requestContext } from "../http";
import { hashPassword, verifyPassword } from "../password";
import {
  completeRegistrationRequest,
  createRegistrationRequest,
  findRegistrationRequest,
  verifyRegistrationRequest,
} from "../repositories/registrationRequests";
import {
  completeLoginChallenge,
  createLoginChallenge,
  findLoginChallenge,
  verifyLoginChallengeByStartToken,
} from "../repositories/loginChallenges";
import {
  countRecentEventsByIp,
  recordSecurityEvent,
} from "../repositories/securityEvents";
import {
  createUser,
  findPasswordHash,
  findUserById,
  findUserByTelegramId,
  usernameOrEmailExists,
} from "../repositories/users";
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
const LOGIN_FAILURE_TURNSTILE_THRESHOLD = 5;
const LOGIN_FAILURE_HARD_LIMIT = 30;
const LOGIN_FAILURE_WINDOW_MINUTES = 15;

export async function loginUser(input: LoginInput, req: NextRequest) {
  const context = requestContext(req);
  const failures = context.ip
    ? await countRecentEventsByIp(
        context.ip,
        "login_failure",
        LOGIN_FAILURE_WINDOW_MINUTES,
      )
    : 0;

  if (failures >= LOGIN_FAILURE_HARD_LIMIT) {
    await recordSecurityEvent({
      eventType: "login_failure",
      result: "rate_limited",
      context,
    });
    throw new Error("too many attempts, try again later");
  }

  if (failures >= LOGIN_FAILURE_TURNSTILE_THRESHOLD) {
    const turnstileOk = await verifyTurnstile(input.turnstileToken, context.ip);
    if (!turnstileOk) {
      await recordSecurityEvent({
        eventType: "login_failure",
        result: "turnstile_required",
        context,
      });
      throw new Error("verification required");
    }
  }

  const credentials = await findPasswordHash(input.identifier);
  if (!credentials) {
    // Equalize timing for unknown identifiers: scrypt against a static
    // dummy hash so the request takes roughly as long as a real password
    // verification. Without this, an attacker can distinguish "no such
    // user" (instant return) from "user exists" (~100ms scrypt) and
    // enumerate accounts.
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
    await recordSecurityEvent({
      eventType: "login_failure",
      result: "invalid",
      context,
    });
    throw new Error("invalid credentials");
  }

  if (credentials.status === "banned") {
    await recordSecurityEvent({
      userId: Number(credentials.id),
      eventType: "login_failure",
      result: "banned",
      context,
    });
    throw new Error("account banned");
  }

  const valid = await verifyPassword(input.password, credentials.password_hash);
  if (!valid) {
    await recordSecurityEvent({
      userId: Number(credentials.id),
      eventType: "login_failure",
      result: "invalid",
      context,
    });
    throw new Error("invalid credentials");
  }

  const user = await findUserById(Number(credentials.id));
  if (!user) {
    throw new Error("invalid credentials");
  }

  await recordSecurityEvent({
    userId: user.id,
    eventType: "login_success",
    result: "ok",
    context,
  });

  return user;
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

export async function verifyTelegramLoginChallenge(
  startToken: string,
  telegram: TelegramIdentity,
  req: NextRequest,
) {
  const context = requestContext(req);
  const challenge = await verifyLoginChallengeByStartToken({
    startToken,
    telegramId: telegram.id,
  });

  if (!challenge) {
    return null;
  }

  await recordSecurityEvent({
    userId: challenge.userId,
    eventType: "login_2fa_success",
    result: "verified",
    context,
    metadata: { challengeId: challenge.publicId, telegramId: telegram.id },
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

export async function verifyRegistrationByTelegram(
  startToken: string,
  telegram: TelegramIdentity,
  req: NextRequest,
) {
  const context = requestContext(req);
  const request = await verifyRegistrationRequest(hashToken(startToken), telegram);
  if (!request) {
    await recordSecurityEvent({
      eventType: "telegram_verify_failure",
      result: "invalid_start_token",
      context,
    });
    throw new Error("invalid verification token");
  }

  await recordSecurityEvent({
    eventType: "telegram_verify_success",
    result: "ok",
    context,
    metadata: { requestId: request.publicId, telegramId: telegram.id },
  });

  return request;
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

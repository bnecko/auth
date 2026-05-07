import type { NextRequest } from "next/server";
import { registrationTtlMinutes } from "../config";
import {
  hashToken,
  normalizeIdentifier,
  publicId,
  verificationCode,
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
      code: string;
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

  const code = verificationCode();
  const expiresAt = new Date(Date.now() + registrationTtlMinutes() * 60_000);
  const request = await createRegistrationRequest({
    publicId: publicId("reg"),
    firstName: input.firstName,
    username: input.username,
    bio: input.bio,
    email: input.email,
    dob: input.dob,
    passwordHash,
    codeHash: hashToken(code),
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
    code,
    expiresAt: request.expiresAt,
  };
}

export async function loginUser(input: LoginInput, req: NextRequest) {
  const context = requestContext(req);
  const failures = context.ip
    ? await countRecentEventsByIp(context.ip, "login_failure", 15)
    : 0;

  if (failures >= 5) {
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

export async function verifyRegistrationByTelegram(
  code: string,
  telegram: TelegramIdentity,
  req: NextRequest,
) {
  const context = requestContext(req);
  const request = await verifyRegistrationRequest(hashToken(code), telegram);
  if (!request) {
    await recordSecurityEvent({
      eventType: "telegram_verify_failure",
      result: "invalid_code",
      context,
    });
    throw new Error("invalid verification code");
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

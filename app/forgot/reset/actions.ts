"use server";

import redis from "@/lib/server/redis";
import { updateUserPassword } from "@/lib/server/repositories/users";
import { hashPassword } from "@/lib/server/password";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { hashToken } from "@/lib/server/crypto";
import { revokeSessionsForUser } from "@/lib/server/repositories/sessions";
import { requestContextFromHeaders } from "@/lib/server/http";
import { headers } from "next/headers";

export async function resetPasswordAction(formData: FormData) {
  const token = formData.get("token");
  const password = formData.get("password");

  if (typeof token !== "string" || !token) {
    return { error: "Invalid token" };
  }

  if (typeof password !== "string" || password.length < 10 || password.length > 256) {
    return { error: "Password must be 10-256 characters" };
  }

  const key = `password_reset:${hashToken(token)}`;
  const userIdStr = await redis.getdel(key);

  if (!userIdStr) {
    return { error: "Reset link has expired or is invalid. Please request a new one." };
  }

  const userId = parseInt(userIdStr, 10);
  
  const passwordHash = await hashPassword(password);
  await updateUserPassword(userId, passwordHash);
  await revokeSessionsForUser(userId);
  const context = requestContextFromHeaders(await headers());

  await recordSecurityEvent({
    userId,
    eventType: "password_reset_completed",
    result: "ok",
    context,
    metadata: {},
  });

  return { success: true };
}

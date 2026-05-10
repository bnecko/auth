"use server";

import { redirect } from "next/navigation";
import redis from "@/lib/server/redis";
import { updateUserPassword } from "@/lib/server/repositories/users";
import { hashPassword } from "@/lib/server/password";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

export async function resetPasswordAction(formData: FormData) {
  const token = formData.get("token");
  const password = formData.get("password");

  if (typeof token !== "string" || !token) {
    return { error: "Invalid token" };
  }

  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const key = `password_reset:${token}`;
  const userIdStr = await redis.get(key);

  if (!userIdStr) {
    return { error: "Reset link has expired or is invalid. Please request a new one." };
  }

  const userId = parseInt(userIdStr, 10);
  
  const passwordHash = await hashPassword(password);
  await updateUserPassword(userId, passwordHash);

  await redis.del(key);

  await recordSecurityEvent({
    userId,
    eventType: "password_reset_completed",
    result: "ok",
    context: { ip: "", userAgent: "", country: "" },
    metadata: {},
  });

  return { success: true };
}

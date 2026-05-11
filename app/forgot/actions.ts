"use server";

import { findUserByIdentifier } from "@/lib/server/repositories/users";
import redis from "@/lib/server/redis";
import { hashToken, randomToken } from "@/lib/server/crypto";
import { sendTelegramMessage } from "@/lib/server/telegramSend";
import { authBaseUrl } from "@/lib/server/config";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/server/rateLimit";
import { requestContextFromHeaders } from "@/lib/server/http";

export async function requestPasswordReset(formData: FormData) {
  const identifier = formData.get("identifier");
  if (typeof identifier !== "string" || !identifier) {
    return { error: "Please enter your username or email" };
  }

  const headersList = await headers();
  const context = requestContextFromHeaders(headersList);
  
  const rl = await rateLimit(`rl:forgot:ip:${context.ip || "unknown"}`, 3, 15 * 60 * 1000);
  if (!rl.success) {
    return { error: "Too many requests. Please try again later." };
  }

  const user = await findUserByIdentifier(identifier);
  if (!user) {
    // Return success to prevent enumeration
    return { success: true };
  }

  if (!user.telegramId) {
    return { success: true };
  }

  const token = randomToken(32);
  const key = `password_reset:${hashToken(token)}`;
  
  await redis.setex(key, 15 * 60, user.id.toString());

  const resetLink = `${authBaseUrl()}/forgot/reset?token=${token}`;

  try {
    await sendTelegramMessage({
      chatId: user.telegramId,
      text: `<b>Password Reset Request</b>\n\nSomeone requested a password reset for your Bottleneck account.\n\nClick here to reset your password: <a href="${resetLink}">Reset Password</a>\n\nIf you did not request this, please ignore this message.`,
    });

    await recordSecurityEvent({
      userId: user.id,
      eventType: "password_reset_requested",
      result: "ok",
      context,
      metadata: {},
    });
  } catch (err) {
    console.error("Failed to send reset telegram", err);
    return { success: true };
  }

  return { success: true };
}

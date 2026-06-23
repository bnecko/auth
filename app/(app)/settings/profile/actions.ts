"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentSession, assertNotRestricted } from "@/lib/server/session";
import { requestContextFromHeaders } from "@/lib/server/http";
import {
  updateProfile,
  requestProfileChange,
  completeEmailChange,
} from "@/lib/server/services/profile";
import { requestEmailCode, verifyEmailCode } from "@/lib/server/emailVerification";
import { setEmailVerified } from "@/lib/server/repositories/users";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

async function ctx() {
  return requestContextFromHeaders(await headers());
}

export type ProfileFormState = { error?: string; ok?: boolean; field?: string };
export type EmailVerifyState = { error?: string; ok?: boolean; sent?: boolean };

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);
  try {
    await updateProfile({
      user: current.user,
      body: {
        firstName: formData.get("firstName"),
        bio: formData.get("bio"),
        avatarPreset: formData.get("avatarPreset"),
      },
      context: await ctx(),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not save profile" };
  }
  // Intentionally no revalidatePath here: the form already reflects the saved
  // values, and skipping the route refresh lets useActionState settle
  // immediately so the "Profile saved" confirmation reliably appears (the
  // avatar/name elsewhere refresh on the next navigation).
  return { ok: true };
}

export async function requestIdentityChangeAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);
  const field = String(formData.get("field") || "");
  if (field !== "username" && field !== "email") {
    return { error: "invalid field" };
  }
  try {
    await requestProfileChange({
      user: current.user,
      field,
      newValue: String(formData.get("newValue") || ""),
      currentPassword: String(formData.get("currentPassword") || ""),
      context: await ctx(),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not request change" };
  }
  revalidatePath("/settings/profile");
  return { ok: true, field };
}

// Flow A: verify the account's CURRENT email. Send the code.
export async function requestEmailVerificationAction(
  _prev: EmailVerifyState,
  _formData: FormData,
): Promise<EmailVerifyState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);
  const res = await requestEmailCode(current.user.email, "settings");
  if (res.throttled) {
    return { error: "Please wait a moment before requesting another code." };
  }
  return { sent: true };
}

// Flow A: confirm the code for the current email.
export async function confirmEmailVerificationAction(
  _prev: EmailVerifyState,
  formData: FormData,
): Promise<EmailVerifyState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);
  const code = String(formData.get("code") || "").trim();
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code." };

  const ok = await verifyEmailCode(current.user.email, "settings", code);
  if (!ok) return { error: "Incorrect or expired code." };

  await setEmailVerified(current.user.id);
  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "email_verified",
    result: "ok",
    context: await ctx(),
  });
  revalidatePath("/settings/profile");
  return { ok: true };
}

// Flow B: confirm the code sent to a NEW email so the change can apply.
export async function confirmEmailChangeAction(
  _prev: EmailVerifyState,
  formData: FormData,
): Promise<EmailVerifyState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);
  const code = String(formData.get("code") || "").trim();
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code." };

  try {
    await completeEmailChange({ userId: current.user.id, code, context: await ctx() });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not confirm email" };
  }
  revalidatePath("/settings/profile");
  return { ok: true };
}

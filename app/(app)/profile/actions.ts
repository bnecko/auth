"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentSession } from "@/lib/server/session";
import { requestContextFromHeaders } from "@/lib/server/http";
import { updateProfile, requestProfileChange } from "@/lib/server/services/profile";

async function ctx() {
  return requestContextFromHeaders(await headers());
}

export type ProfileFormState = { error?: string; ok?: boolean; field?: string };

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
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
  revalidatePath("/profile");
  return { ok: true };
}

export async function requestIdentityChangeAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
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
  revalidatePath("/profile");
  return { ok: true, field };
}

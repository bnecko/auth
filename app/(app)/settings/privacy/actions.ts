"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/server/session";
import { updatePrivacySettings } from "@/lib/server/repositories/users";
import type { ToggleFormState } from "../SettingsToggleForm";

export async function updatePrivacyAction(
  _prev: ToggleFormState,
  formData: FormData,
): Promise<ToggleFormState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  try {
    await updatePrivacySettings(current.user.id, {
      profilePublic: formData.get("profilePublic") === "on",
      discoverableByUsername: formData.get("discoverableByUsername") === "on",
      publicShowTelegram: formData.get("publicShowTelegram") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not save settings" };
  }
  revalidatePath("/settings/privacy");
  revalidatePath(`/u/${current.user.publicId}`);
  return { ok: true };
}

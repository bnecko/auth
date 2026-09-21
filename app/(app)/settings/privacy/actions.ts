"use server";

import { revalidatePath } from "next/cache";
import { cryptoEnabled } from "@/lib/server/config";
import { getCurrentSession, assertNotRestricted } from "@/lib/server/session";
import { updatePrivacySettings } from "@/lib/server/repositories/users";
import type { ToggleFormState } from "../SettingsToggleForm";

export async function updatePrivacyAction(
  _prev: ToggleFormState,
  formData: FormData,
): Promise<ToggleFormState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);
  try {
    await updatePrivacySettings(current.user.id, {
      profilePublic: formData.get("profilePublic") === "on",
      discoverableByUsername: formData.get("discoverableByUsername") === "on",
      publicShowTelegram: formData.get("publicShowTelegram") === "on",
      // With the crypto switch off the badge toggle is not rendered, so its
      // absence from the form is not the user turning it off.
      publicShowDonor: cryptoEnabled()
        ? formData.get("publicShowDonor") === "on"
        : current.user.publicShowDonor,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not save settings" };
  }
  revalidatePath("/settings/privacy");
  revalidatePath(`/u/${current.user.publicId}`);
  return { ok: true };
}

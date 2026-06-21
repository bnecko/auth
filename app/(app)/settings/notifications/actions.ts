"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession, assertNotRestricted } from "@/lib/server/session";
import { updateNotificationPrefs } from "@/lib/server/repositories/users";
import type { ToggleFormState } from "../SettingsToggleForm";

export async function updateNotificationsAction(
  _prev: ToggleFormState,
  formData: FormData,
): Promise<ToggleFormState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);
  try {
    await updateNotificationPrefs(current.user.id, {
      notifySecurityReceipts: formData.get("notifySecurityReceipts") === "on",
      notifySigninAlerts: formData.get("notifySigninAlerts") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not save preferences" };
  }
  revalidatePath("/settings/notifications");
  return { ok: true };
}

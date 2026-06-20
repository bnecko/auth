"use server";

import { revalidatePath } from "next/cache";
import { requireAdminStepUpSession } from "@/lib/server/apiAuth";
import { addSupporter, removeSupporter } from "@/lib/server/services/support";

export async function addSupporterAction(formData: FormData) {
  const current = await requireAdminStepUpSession();
  const username = String(formData.get("username") || "").trim();
  if (username) {
    await addSupporter({ admin: current.user, username });
  }
  revalidatePath("/admin/supporters");
}

export async function removeSupporterAction(formData: FormData) {
  const current = await requireAdminStepUpSession();
  const userId = Number(formData.get("userId") || 0);
  if (userId) {
    await removeSupporter({ admin: current.user, userId });
  }
  revalidatePath("/admin/supporters");
}

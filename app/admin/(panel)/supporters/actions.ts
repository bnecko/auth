"use server";

import { revalidatePath } from "next/cache";
import { requireAdminStepUpSession } from "@/lib/server/apiAuth";
import { addSupporter, removeSupporter } from "@/lib/server/services/support";

export async function addSupporterAction(formData: FormData) {
  const current = await requireAdminStepUpSession();
  const username = String(formData.get("username") || "").trim();
  const roleRaw = String(formData.get("role") || "supporter");
  const role =
    roleRaw === "security" || roleRaw === "security_high" ? roleRaw : "supporter";
  if (username) {
    await addSupporter({ admin: current.user, username, role });
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

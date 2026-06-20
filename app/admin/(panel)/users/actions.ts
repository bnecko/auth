"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdminStepUpSession } from "@/lib/server/apiAuth";
import { setAccountStatus } from "@/lib/server/services/admin";
import { requestContextFromHeaders } from "@/lib/server/http";

export async function banUserAction(formData: FormData) {
  const current = await requireAdminStepUpSession();

  const userId = Number(formData.get("userId"));
  if (!userId) return;
  if (userId === current.user.id) return; // never self-ban

  const reason = String(formData.get("reason") || "").trim() || null;
  const ctx = requestContextFromHeaders(await headers());
  await setAccountStatus(userId, "banned", current.user, ctx, reason);
  revalidatePath("/admin/users");
}

export async function unbanUserAction(formData: FormData) {
  const current = await requireAdminStepUpSession();

  const userId = Number(formData.get("userId"));
  if (!userId) return;

  const ctx = requestContextFromHeaders(await headers());
  await setAccountStatus(userId, "active", current.user, ctx);
  revalidatePath("/admin/users");
}

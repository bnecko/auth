"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/server/session";
import { setAccountStatus } from "@/lib/server/services/admin";
import { requestContextFromHeaders } from "@/lib/server/http";

export async function banUserAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") throw new Error("forbidden");

  const userId = Number(formData.get("userId"));
  if (!userId) return;

  const ctx = requestContextFromHeaders(await headers());
  await setAccountStatus(userId, "banned", current.user, ctx);
  revalidatePath("/admin/users");
}

export async function unbanUserAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") throw new Error("forbidden");

  const userId = Number(formData.get("userId"));
  if (!userId) return;

  const ctx = requestContextFromHeaders(await headers());
  await setAccountStatus(userId, "active", current.user, ctx);
  revalidatePath("/admin/users");
}

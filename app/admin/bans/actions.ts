"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/server/session";
import { query } from "@/lib/server/db";

export async function revokeBanAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") throw new Error("forbidden");

  const banId = Number(formData.get("banId"));
  if (!banId) return;

  await query(
    `update bans set revoked_at = now() where id = $1 and revoked_at is null`,
    [banId],
  );
  revalidatePath("/admin/bans");
}

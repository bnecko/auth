"use server";

import { revalidatePath } from "next/cache";
import { requireAdminStepUpSession } from "@/lib/server/apiAuth";
import { query } from "@/lib/server/db";

export async function revokeBanAction(formData: FormData) {
  await requireAdminStepUpSession();

  const banId = Number(formData.get("banId"));
  if (!banId) return;

  await query(
    `update bans set revoked_at = now() where id = $1 and revoked_at is null`,
    [banId],
  );
  revalidatePath("/admin/bans");
}

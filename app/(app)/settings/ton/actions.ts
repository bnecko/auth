"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requestContextFromHeaders } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { unlinkTonWallet } from "@/lib/server/repositories/tonWallets";
import { assertNotRestricted, getCurrentSession } from "@/lib/server/session";

export async function unlinkTonWalletAction() {
  const current = await getCurrentSession();
  if (!current) return;
  assertNotRestricted(current);

  if (await unlinkTonWallet(current.user.id)) {
    await recordSecurityEvent({
      userId: current.user.id,
      eventType: "ton_wallet_unlinked",
      result: "self",
      context: requestContextFromHeaders(await headers()),
    });
    await notifyUser(current.user.id, { type: "ton_wallet_unlinked" });
  }

  revalidatePath("/settings/ton");
}

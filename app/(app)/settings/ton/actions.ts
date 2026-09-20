"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requestContextFromHeaders } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { setTonWalletDisplay, unlinkTonWallet } from "@/lib/server/repositories/tonWallets";
import { assertNotRestricted, getCurrentSession } from "@/lib/server/session";
import type { ToggleFormState } from "../SettingsToggleForm";

export async function updateTonDisplayAction(
  _prev: ToggleFormState,
  formData: FormData,
): Promise<ToggleFormState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);

  const display = formData.get("display");
  if (display !== "hidden" && display !== "address") {
    return { error: "pick one of the listed options" };
  }

  await setTonWalletDisplay(current.user.id, display);
  revalidatePath("/settings/ton");
  revalidatePath(`/u/${current.user.publicId}`);
  return { ok: true };
}

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

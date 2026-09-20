"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requestContextFromHeaders } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import {
  findTonWallet,
  setTonWalletDisplay,
  setTonWalletDomain,
  unlinkTonWallet,
} from "@/lib/server/repositories/tonWallets";
import { listOwnedDomains, normalizeDomainLabel, ownsDomain } from "@/lib/server/ton/dns";
import { rateLimit } from "@/lib/server/rateLimit";
import { assertNotRestricted, getCurrentSession } from "@/lib/server/session";
import type { DisplayState } from "./WalletDisplayForm";

const LOOKUP_LIMIT = 10;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;

export async function updateTonDisplayAction(
  _prev: DisplayState,
  formData: FormData,
): Promise<DisplayState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);

  const wallet = await findTonWallet(current.user.id);
  if (!wallet) return { error: "link a wallet first" };

  if (formData.get("intent") === "load") {
    const limit = await rateLimit(`rl:tondomains:user:${current.user.id}`, LOOKUP_LIMIT, LOOKUP_WINDOW_MS);
    if (!limit.success) return { error: "too many lookups, wait a few minutes" };
    try {
      const domains = await listOwnedDomains(wallet.address);
      if (domains.length === 0) return { error: "that wallet does not hold any .ton domains" };
      return { domains: domains.map(domain => domain.name) };
    } catch {
      // A vendor being unreachable changes nothing about what is on display.
      return { error: "could not reach the TON network just now, try again" };
    }
  }

  const display = String(formData.get("display") ?? "");

  if (display === "hidden" || display === "address") {
    await setTonWalletDisplay(current.user.id, display);
  } else if (display === "domain") {
    const label = normalizeDomainLabel(String(formData.get("domain") ?? ""));
    if (!label) return { error: "pick one of the listed options" };
    // The posted value came from the browser, so ownership is confirmed again
    // here rather than trusting whatever the form sent back.
    try {
      if (!(await ownsDomain(wallet.address, label))) {
        return { error: "that wallet does not hold that domain" };
      }
    } catch {
      return { error: "could not reach the TON network just now, try again" };
    }
    await setTonWalletDomain(current.user.id, label);
  } else {
    return { error: "pick one of the listed options" };
  }

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

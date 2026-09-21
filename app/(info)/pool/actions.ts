"use server";

import { revalidatePath } from "next/cache";
import {
  donateToPool,
  formatGram,
  InsufficientBalance,
  parseGram,
} from "@/lib/server/repositories/billing";
import { assertNotRestricted, getCurrentSession } from "@/lib/server/session";

export type ContributeState = { error?: string; donated?: string } | null;

const SUBMISSION_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export async function contributeToPoolAction(
  _prev: ContributeState,
  formData: FormData,
): Promise<ContributeState> {
  const current = await getCurrentSession();
  if (!current) return { error: "sign in to contribute" };
  assertNotRestricted(current);

  const amountNano = parseGram(String(formData.get("amount") ?? ""));
  if (!amountNano) return { error: "enter an amount in btGRAM, for example 0.5" };

  // Minted when the form was rendered, so a double click or a resubmitted page
  // carries the same token and moves the amount once. Namespaced by user, so
  // nobody can spend a token on someone else's behalf.
  const token = String(formData.get("submission") ?? "");
  if (!SUBMISSION_TOKEN.test(token)) return { error: "reload the page and try again" };

  try {
    await donateToPool({
      userId: current.user.id,
      amountNano,
      reference: `${current.user.id}:${token}`,
    });
  } catch (err) {
    if (err instanceof InsufficientBalance) return { error: "that is more than your balance" };
    throw err;
  }

  revalidatePath("/pool");
  revalidatePath("/billing");
  return { donated: formatGram(amountNano.toString()) };
}

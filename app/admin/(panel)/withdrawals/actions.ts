"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireAdminStepUpSession } from "@/lib/server/apiAuth";
import { cryptoEnabled } from "@/lib/server/config";
import { requestContextFromHeaders } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { formatGram } from "@/lib/server/repositories/billing";
import {
  approveWithdrawal,
  markWithdrawalSent,
  rejectWithdrawal,
} from "@/lib/server/repositories/billingWithdrawals";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

const MAX_REASON_LENGTH = 300;

async function recordDecision(adminId: number, eventType: string, withdrawalId: number) {
  await recordSecurityEvent({
    userId: adminId,
    eventType,
    result: "ok",
    context: requestContextFromHeaders(await headers()),
    metadata: { withdrawalId },
  });
}

export async function approveWithdrawalAction(formData: FormData) {
  const current = await requireAdminStepUpSession();
  if (!cryptoEnabled()) notFound();
  const withdrawalId = Number(formData.get("withdrawalId"));
  if (!withdrawalId) return;

  if (await approveWithdrawal({ withdrawalId, adminId: current.user.id })) {
    await recordDecision(current.user.id, "withdrawal_approved", withdrawalId);
  }
  revalidatePath("/admin/withdrawals");
}

export async function rejectWithdrawalAction(formData: FormData) {
  const current = await requireAdminStepUpSession();
  if (!cryptoEnabled()) notFound();
  const withdrawalId = Number(formData.get("withdrawalId"));
  if (!withdrawalId) return;

  // The reason is repeated to the user on their billing page and in a Telegram
  // message, so it is kept to something that fits in both.
  const reason = String(formData.get("reason") || "").trim().slice(0, MAX_REASON_LENGTH) || null;
  const rejected = await rejectWithdrawal({ withdrawalId, adminId: current.user.id, reason });
  if (rejected) {
    await recordDecision(current.user.id, "withdrawal_rejected", withdrawalId);
    if (rejected.userId !== null) {
      await notifyUser(rejected.userId, {
        type: "withdrawal_declined",
        amount: formatGram(rejected.amountNano),
        reason,
      });
    }
  }
  revalidatePath("/admin/withdrawals");
}

export async function markWithdrawalSentAction(formData: FormData) {
  const current = await requireAdminStepUpSession();
  if (!cryptoEnabled()) notFound();
  const withdrawalId = Number(formData.get("withdrawalId"));
  if (!withdrawalId) return;

  if (await markWithdrawalSent(withdrawalId)) {
    await recordDecision(current.user.id, "withdrawal_marked_sent", withdrawalId);
  }
  revalidatePath("/admin/withdrawals");
}

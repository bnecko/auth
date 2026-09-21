"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdminStepUpSession } from "@/lib/server/apiAuth";
import { requestContextFromHeaders } from "@/lib/server/http";
import {
  approveWithdrawal,
  markWithdrawalSent,
  rejectWithdrawal,
} from "@/lib/server/repositories/billingWithdrawals";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

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
  const withdrawalId = Number(formData.get("withdrawalId"));
  if (!withdrawalId) return;

  if (await approveWithdrawal({ withdrawalId, adminId: current.user.id })) {
    await recordDecision(current.user.id, "withdrawal_approved", withdrawalId);
  }
  revalidatePath("/admin/withdrawals");
}

export async function rejectWithdrawalAction(formData: FormData) {
  const current = await requireAdminStepUpSession();
  const withdrawalId = Number(formData.get("withdrawalId"));
  if (!withdrawalId) return;

  const reason = String(formData.get("reason") || "").trim() || null;
  if (await rejectWithdrawal({ withdrawalId, adminId: current.user.id, reason })) {
    await recordDecision(current.user.id, "withdrawal_rejected", withdrawalId);
  }
  revalidatePath("/admin/withdrawals");
}

export async function markWithdrawalSentAction(formData: FormData) {
  const current = await requireAdminStepUpSession();
  const withdrawalId = Number(formData.get("withdrawalId"));
  if (!withdrawalId) return;

  if (await markWithdrawalSent(withdrawalId)) {
    await recordDecision(current.user.id, "withdrawal_marked_sent", withdrawalId);
  }
  revalidatePath("/admin/withdrawals");
}

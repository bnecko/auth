"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { authBaseUrl, cryptoEnabled } from "@/lib/server/config";
import { requestContextFromHeaders } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { rateLimit } from "@/lib/server/rateLimit";
import { formatGram, InsufficientBalance, parseGram } from "@/lib/server/repositories/billing";
import {
  cancelWithdrawal,
  MIN_WITHDRAWAL_NANO,
  requestWithdrawal,
  WithdrawalRefused,
  type WithdrawalRefusal,
} from "@/lib/server/repositories/billingWithdrawals";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { startKycSession } from "@/lib/server/repositories/kyc";
import { createVerificationSession, isDiditConfigured } from "@/lib/server/kyc/didit";
import { sendOperatorAlert } from "@/lib/server/services/operatorAlerts";
import { assertNotRestricted, getCurrentSession } from "@/lib/server/session";

export type VerifyState = { error?: string } | null;
export type WithdrawState = { error?: string } | null;

// Each request pages a person, so this is sized to a user correcting a typo,
// not to a loop of request and cancel.
const WITHDRAW_LIMIT = 5;
const WITHDRAW_WINDOW_MS = 60 * 60 * 1000;

const REFUSAL_MESSAGE: Record<WithdrawalRefusal, string> = {
  identity_not_verified: "verify your identity before withdrawing",
  no_wallet: "link a TON wallet first, withdrawals are paid to it",
  below_minimum: `the smallest withdrawal is ${formatGram(MIN_WITHDRAWAL_NANO.toString())} GRAM`,
  already_open: "you already have a withdrawal in progress",
};

export async function startVerificationAction(): Promise<VerifyState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);
  if (!cryptoEnabled()) notFound();

  if (!isDiditConfigured()) return { error: "identity verification is not available yet" };

  let url: string;
  try {
    const session = await createVerificationSession({
      userId: current.user.id,
      // Where the provider returns the user afterwards. The result itself
      // arrives by webhook, so this only decides where they land.
      callbackUrl: `${authBaseUrl().replace(/\/+$/, "")}/billing`,
    });
    await startKycSession(current.user.id, session.sessionId);
    await recordSecurityEvent({
      userId: current.user.id,
      eventType: "kyc_session_started",
      result: "ok",
      context: requestContextFromHeaders(await headers()),
    });
    url = session.url;
  } catch (err) {
    log.error("kyc_session_start_failed", { userId: current.user.id, error: err });
    return { error: "could not start verification just now, try again" };
  }

  // Outside the try: redirect() signals by throwing, and catching it here
  // would turn a working redirect into the error message above.
  redirect(url);
}

export async function requestWithdrawalAction(
  _prev: WithdrawState,
  formData: FormData,
): Promise<WithdrawState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);
  if (!cryptoEnabled()) notFound();

  const amountNano = parseGram(String(formData.get("amount") ?? ""));
  if (!amountNano) return { error: "enter an amount in GRAM, for example 1.5" };

  const limit = await rateLimit(`rl:withdraw:user:${current.user.id}`, WITHDRAW_LIMIT, WITHDRAW_WINDOW_MS);
  if (!limit.success) return { error: "too many withdrawal requests, try again in an hour" };

  let withdrawalId: number;
  try {
    const withdrawal = await requestWithdrawal({ userId: current.user.id, amountNano });
    withdrawalId = withdrawal.id;
  } catch (err) {
    if (err instanceof WithdrawalRefused) return { error: REFUSAL_MESSAGE[err.reason] };
    if (err instanceof InsufficientBalance) return { error: "that is more than your balance" };
    throw err;
  }

  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "withdrawal_requested",
    result: "ok",
    context: requestContextFromHeaders(await headers()),
    metadata: { withdrawalId, amountNano: amountNano.toString() },
  });
  await sendOperatorAlert(
    `withdrawal_requested:${withdrawalId}`,
    `Withdrawal requested\n@${current.user.username} asks for ${formatGram(amountNano.toString())} GRAM\n${authBaseUrl().replace(/\/+$/, "")}/admin/withdrawals`,
  );

  revalidatePath("/billing");
  return null;
}

export async function cancelWithdrawalAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current) return;
  assertNotRestricted(current);
  if (!cryptoEnabled()) notFound();

  const withdrawalId = Number(formData.get("withdrawalId"));
  if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) return;

  if (await cancelWithdrawal({ userId: current.user.id, withdrawalId })) {
    await recordSecurityEvent({
      userId: current.user.id,
      eventType: "withdrawal_cancelled",
      result: "ok",
      context: requestContextFromHeaders(await headers()),
      metadata: { withdrawalId },
    });
  }
  revalidatePath("/billing");
}

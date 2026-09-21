import { type NextRequest } from "next/server";
import { cryptoEnabled } from "@/lib/server/config";
import { safeEqual } from "@/lib/server/crypto";
import { badRequest, forbidden, json, notFound, requestBody } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { notifyUser } from "@/lib/server/notifications";
import { formatGram } from "@/lib/server/repositories/billing";
import { confirmWithdrawalPayment } from "@/lib/server/repositories/billingWithdrawals";
import { isRawAddress } from "@/lib/server/ton/address";

export const runtime = "nodejs";

/**
 * Reports an outbound payment the chain watcher read at the operator's
 * address, so the withdrawal it pays can be settled.
 *
 * The worker sends what it saw and nothing about what it should mean. Whether
 * the payment matches a request, and what happens to the ledger if it does, is
 * decided here, for the same reason deposits are credited here: one
 * implementation of the bookkeeping, reached over the loopback.
 *
 * Idempotent on the withdrawal, so the worker may retry freely. A payment that
 * does not match comes back as outcome "refused" with a 200: the report was
 * received, and the worker is the one who tells the operator.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_ANALYTICS_SECRET || "";
  const presented = req.headers.get("x-bottleneck-internal-secret") || "";
  if (!secret || !safeEqual(presented, secret)) return forbidden();
  if (!cryptoEnabled()) return notFound();

  const body = await requestBody(req);
  const memo = typeof body.memo === "string" ? body.memo : "";
  const txHash = typeof body.txHash === "string" ? body.txHash : "";
  const destination = typeof body.destination === "string" ? body.destination : "";
  const amountNano = typeof body.amountNano === "string" ? body.amountNano : "";

  if (!memo) return badRequest("memo is required");
  if (!txHash) return badRequest("txHash is required");
  if (!isRawAddress(destination)) return badRequest("destination must be a raw address");
  // A string, never a number: a nanocoin amount passes 2^53 at nine coins.
  if (!/^[0-9]+$/.test(amountNano)) return badRequest("amountNano must be a decimal string");

  const result = await confirmWithdrawalPayment({
    memo,
    txHash,
    destination,
    amountNano: BigInt(amountNano),
  });

  if (result.outcome === "confirmed") {
    log.info("billing_withdrawal_confirmed", {
      withdrawalId: result.withdrawalId,
      userId: result.userId,
      amountNano: result.amountNano,
      txHash,
    });
    // "confirmed" comes back once per withdrawal; a retried report is
    // "replayed", so the user is told once however often the worker asks.
    if (result.userId !== null) {
      await notifyUser(result.userId, {
        type: "withdrawal_paid",
        amount: formatGram(result.amountNano),
      });
    }
  } else if (result.outcome === "refused") {
    log.error("billing_withdrawal_payment_refused", {
      withdrawalId: result.withdrawalId,
      reason: result.reason,
      txHash,
    });
  }

  return json({ ok: true, ...result });
}

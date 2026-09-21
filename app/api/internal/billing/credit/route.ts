import { type NextRequest } from "next/server";
import { cryptoEnabled } from "@/lib/server/config";
import { safeEqual } from "@/lib/server/crypto";
import { badRequest, forbidden, json, notFound, requestBody } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { creditDeposit } from "@/lib/server/repositories/billing";

export const runtime = "nodejs";

/**
 * Credits a confirmed on-chain deposit to a user's btGRAM balance.
 *
 * The worker calls this rather than posting to the ledger itself: it runs as
 * plain CommonJS and cannot import the repository, and a second implementation
 * of double-entry bookkeeping in another language is how ledgers drift apart.
 * One implementation, reached over the loopback.
 *
 * Idempotent on the transaction hash, so the worker may retry freely.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_ANALYTICS_SECRET || "";
  const presented = req.headers.get("x-bottleneck-internal-secret") || "";
  if (!secret || !safeEqual(presented, secret)) return forbidden();
  if (!cryptoEnabled()) return notFound();

  const body = await requestBody(req);
  const userId = Number(body.userId);
  const txHash = typeof body.txHash === "string" ? body.txHash : "";
  const amountNano = typeof body.amountNano === "string" ? body.amountNano : "";

  if (!Number.isInteger(userId) || userId <= 0) return badRequest("userId is required");
  if (!txHash) return badRequest("txHash is required");
  // A string, never a number: a nanocoin amount passes 2^53 at nine coins.
  if (!/^[0-9]+$/.test(amountNano)) return badRequest("amountNano must be a decimal string");

  const amount = BigInt(amountNano);
  if (amount <= 0n) return badRequest("amountNano must be positive");

  const result = await creditDeposit({ userId, amountNano: amount, txHash });
  log.info("billing_deposit_credited", { userId, amountNano, posted: result.posted });

  // posted:false means this hash was already credited, which is the expected
  // outcome of a retry rather than a failure.
  return json({ ok: true, posted: result.posted });
}

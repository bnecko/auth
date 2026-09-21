import { type NextRequest } from "next/server";
import { internalBillingSecret } from "@/lib/server/config";
import { safeEqual } from "@/lib/server/crypto";
import { badRequest, cameThroughTunnel, forbidden, json } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { forfeitToPool } from "@/lib/server/repositories/billing";

export const runtime = "nodejs";

/**
 * Sweeps a departing account's remaining balance into the public pool.
 *
 * Called by the purge sweep, which runs in the worker and cannot import the
 * ledger. Same reasoning as the deposit crediting path: one implementation of
 * the money, reached over the loopback.
 *
 * Idempotent. The transfer's reference is the user id, so a retried purge
 * moves the balance once and reports zero thereafter.
 */
export async function POST(req: NextRequest) {
  const secret = internalBillingSecret();
  const presented = req.headers.get("x-bottleneck-internal-secret") || "";
  if (!secret || !safeEqual(presented, secret) || cameThroughTunnel(req)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { userId?: unknown };
  const userId = Number(body.userId);
  if (!Number.isInteger(userId) || userId <= 0) return badRequest("userId is required");

  const { movedNano } = await forfeitToPool(userId);
  if (movedNano !== "0") log.info("billing_balance_forfeited", { userId, movedNano });

  return json({ ok: true, movedNano });
}

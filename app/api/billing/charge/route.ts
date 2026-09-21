import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { cryptoEnabled } from "@/lib/server/config";
import { apiError, json, requestBody } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { rateLimit } from "@/lib/server/rateLimit";
import { findAccessToken } from "@/lib/server/repositories/oauth";
import { chargeUser, getBalanceNano, InsufficientBalance } from "@/lib/server/repositories/billing";

export const runtime = "nodejs";

const APP_LIMIT = 120;
const APP_WINDOW_MS = 60_000;

/**
 * Charges btGRAM from a user's balance to the owner of the calling app.
 *
 * The user is whoever the access token belongs to, never a id the caller
 * names. An app can therefore only ever charge someone who authorised it, and
 * only for as long as that authorisation lasts: naming the subject would let
 * any app with a token debit any account it could guess the id of.
 *
 * Consent is the grant. `billing:charge` is a sensitive scope the user
 * approves on the consent screen, and revoking the app stops the charges.
 */
export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) return apiError("bearer token required", "unauthorized", 401);

  const grant = await findAccessToken(token);
  if (
    !grant ||
    grant.tokenKind !== "user" ||
    !grant.user ||
    grant.user.status === "banned" ||
    grant.app.status !== "active"
  ) {
    return apiError("invalid or expired token", "invalid_token", 401);
  }

  if (!cryptoEnabled()) return apiError("billing is not enabled on this server", "not_found", 404);

  if (!grant.scopes.includes("billing:charge")) {
    return apiError("token is missing the billing:charge scope", "insufficient_scope", 403);
  }

  const limit = await rateLimit(`rl:billing:charge:app:${grant.app.id}`, APP_LIMIT, APP_WINDOW_MS);
  if (!limit.success) return apiError("too many charges", "rate_limited", 429);

  const body = await requestBody(req);
  // A decimal string, never a number: a nanocoin amount passes 2^53 at nine
  // coins, so a JSON number would arrive already rounded.
  const amountNano = typeof body.amountNano === "string" ? body.amountNano : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";

  if (!/^[0-9]+$/.test(amountNano)) {
    return apiError("amountNano must be a decimal string of nanocoins", "invalid_amount", 400);
  }
  if (BigInt(amountNano) <= 0n) {
    return apiError("amountNano must be positive", "invalid_amount", 400);
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return apiError("idempotencyKey must be 8 to 128 characters", "invalid_idempotency_key", 400);
  }

  try {
    // Scoped to the app, so two apps may use the same key without colliding
    // and neither can replay the other's charge.
    const result = await chargeUser({
      userId: grant.user.id,
      appId: grant.app.id,
      amountNano: BigInt(amountNano),
      idempotencyKey: `${grant.app.id}:${idempotencyKey}`,
    });

    log.info("billing_charge", {
      appId: grant.app.id,
      userId: grant.user.id,
      amountNano,
      posted: result.posted,
    });

    // posted:false is a replay of a key already charged. Answering 200 with
    // the same shape is what makes retrying safe for the caller.
    return json({
      ok: true,
      charged: result.posted,
      amountNano,
      balanceNano: await getBalanceNano(grant.user.id),
    });
  } catch (err) {
    if (err instanceof InsufficientBalance) {
      return apiError("the user does not have that much btGRAM", "insufficient_balance", 402);
    }
    throw err;
  }
}

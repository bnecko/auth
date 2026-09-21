import { type NextRequest } from "next/server";
import { cryptoEnabled, diditWebhookSecret } from "@/lib/server/config";
import { json, notFound } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { query } from "@/lib/server/db";
import { mapDiditStatus, verifyDiditWebhook } from "@/lib/server/kyc/diditWebhook";

export const runtime = "nodejs";

/**
 * Identity verification results from Didit.
 *
 * Public by necessity: the caller is a third party with no session. What
 * authenticates it is the HMAC over the raw body plus a five minute freshness
 * window, so a captured delivery cannot be replayed later.
 *
 * Answers 2xx as soon as the row is written. Didit retries twice on a 5xx or a
 * timeout, so anything slow belongs off this path rather than holding it open.
 */
export async function POST(req: NextRequest) {
  // Read as text, not JSON: the signature covers the bytes as transmitted, and
  // parsing first would mean verifying something other than what was sent.
  const rawBody = await req.text();

  const verified = verifyDiditWebhook({
    rawBody,
    signature: req.headers.get("x-signature"),
    signatureV2: req.headers.get("x-signature-v2"),
    timestamp: req.headers.get("x-timestamp"),
    secret: diditWebhookSecret(),
  });

  if (!verified.ok) {
    log.warn("kyc_webhook_rejected", { reason: verified.reason });
    // A wrong secret is our misconfiguration, not their bad request, and a 5xx
    // makes them retry while it is fixed. Everything else is final.
    return json({ error: verified.reason }, verified.reason === "secret" ? 500 : 401);
  }

  if (!cryptoEnabled()) return notFound();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "malformed payload" }, 400);
  }

  const sessionId = typeof payload.session_id === "string" ? payload.session_id : "";
  // Set when the session is created, echoed back here: it is how a result
  // finds the account it belongs to without trusting anything user-supplied.
  const userId = Number(payload.vendor_data);
  const status = mapDiditStatus(payload.status);

  if (!sessionId || !Number.isInteger(userId) || userId <= 0) {
    log.warn("kyc_webhook_unusable", { sessionId: Boolean(sessionId), webhookType: payload.webhook_type });
    return json({ ok: true, ignored: "missing session or vendor_data" });
  }

  if (!status) {
    // An unrecognised status is never treated as progress. Guessing wrong in
    // the approving direction would open withdrawals.
    log.warn("kyc_webhook_unknown_status", { providerStatus: payload.status });
    return json({ ok: true, ignored: "unknown status" });
  }

  try {
    await query(
      `insert into kyc_applications (user_id, session_id, status, provider_status, decided_at)
            values ($1, $2, $3, $4, case when $3 in ('approved','declined') then now() else null end)
       on conflict (user_id) do update
          set session_id = excluded.session_id,
              status = excluded.status,
              provider_status = excluded.provider_status,
              decided_at = coalesce(excluded.decided_at, kyc_applications.decided_at),
              updated_at = now()`,
      [userId, sessionId, status, String(payload.status ?? "")],
    );
  } catch (err) {
    // A result for a user we do not have. Retrying cannot fix that, and a 5xx
    // would make Didit try twice more before giving up, so it is accepted and
    // dropped rather than failed.
    if (err instanceof Error && (err as Error & { code?: string }).code === "23503") {
      log.warn("kyc_webhook_unknown_user", { userId });
      return json({ ok: true, ignored: "unknown user" });
    }
    throw err;
  }

  log.info("kyc_webhook_applied", { userId, status });
  return json({ ok: true });
}

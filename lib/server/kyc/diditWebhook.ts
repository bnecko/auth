import { createHmac } from "crypto";
import { safeEqual } from "../crypto";

// Didit rejects anything older than five minutes; matching that bound is what
// stops a captured webhook being replayed later.
export const MAX_WEBHOOK_AGE_SECONDS = 300;

// Their status strings, verbatim and case sensitive, mapped to ours. Anything
// unrecognised is refused rather than guessed at: a new status we silently
// treated as approved would let someone withdraw.
const STATUS = new Map<string, string>([
  ["Not Started", "not_started"],
  ["In Progress", "in_progress"],
  ["Awaiting User", "awaiting_user"],
  ["In Review", "in_review"],
  ["Resubmitted", "in_review"],
  ["Approved", "approved"],
  ["Declined", "declined"],
  ["Expired", "expired"],
  ["Kyc Expired", "expired"],
  ["Abandoned", "abandoned"],
]);

export function mapDiditStatus(status: unknown): string | null {
  return typeof status === "string" ? STATUS.get(status) ?? null : null;
}

const hmac = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("hex");

// Their V2 signature is over "sorted, unicode-preserved compact JSON", which is
// Python's json.dumps(sort_keys=True, separators=(',',':'), ensure_ascii=False).
// JSON.stringify already emits compact output and leaves non-ASCII unescaped,
// so only the key ordering has to be imposed.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Checks that a webhook really came from Didit and is recent.
 *
 * Takes the raw body, never a parsed object. The legacy X-Signature covers the
 * bytes exactly as transmitted, so it is tried first and needs no parsing at
 * all; V2 is only attempted if that fails, because computing it requires
 * re-serialising and any disagreement about canonical form would reject a
 * genuine delivery.
 */
export function verifyDiditWebhook(input: {
  rawBody: string;
  signature: string | null;
  signatureV2: string | null;
  timestamp: string | null;
  secret: string;
  now?: number;
}): { ok: true } | { ok: false; reason: "secret" | "timestamp" | "signature" } {
  if (!input.secret) return { ok: false, reason: "secret" };

  const sentAt = Number(input.timestamp);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > MAX_WEBHOOK_AGE_SECONDS) {
    return { ok: false, reason: "timestamp" };
  }

  if (input.signature && safeEqual(input.signature, hmac(input.secret, input.rawBody))) {
    return { ok: true };
  }

  if (input.signatureV2) {
    try {
      const canonical = canonicalJson(JSON.parse(input.rawBody));
      if (safeEqual(input.signatureV2, hmac(input.secret, canonical))) return { ok: true };
    } catch {
      // Unparseable body: nothing to canonicalise, so the signature cannot match.
    }
  }

  return { ok: false, reason: "signature" };
}

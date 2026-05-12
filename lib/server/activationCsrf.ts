import { createHmac, timingSafeEqual } from "crypto";
import { oauthCsrfSecret } from "./config";

const MAX_AGE_SECONDS = 600;

// Stateless CSRF token for the activation approve/deny forms.
//
// Same shape as the OAuth consent CSRF helper but bound to the
// activation public id rather than the OAuth client and state. The
// session cookie is SameSite=Lax, so a cross-site top-level form POST
// to /api/activations/<id>/approve would otherwise succeed. Binding
// to the session id stops an attacker who knows a victim's pending
// activation id from forging the approve.

export function mintActivationCsrf(input: {
  sessionId: number;
  activationId: string;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const sig = signCsrf({ ...input, issuedAt });
  return `${issuedAt}.${sig}`;
}

export function verifyActivationCsrf(input: {
  token: string;
  sessionId: number;
  activationId: string;
}) {
  const parts = input.token.split(".");
  if (parts.length !== 2) return false;
  const [issuedAtRaw, providedSig] = parts;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;

  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
  if (ageSeconds < 0 || ageSeconds > MAX_AGE_SECONDS) return false;

  const expectedSig = signCsrf({
    sessionId: input.sessionId,
    activationId: input.activationId,
    issuedAt,
  });
  const provided = Buffer.from(providedSig, "hex");
  const expected = Buffer.from(expectedSig, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

function signCsrf(input: {
  sessionId: number;
  activationId: string;
  issuedAt: number;
}) {
  const secret = oauthCsrfSecret();
  if (!secret) {
    throw new Error("oauthCsrfSecret is not configured");
  }
  return createHmac("sha256", secret)
    .update(`activation:${input.sessionId}:${input.activationId}:${input.issuedAt}`)
    .digest("hex");
}

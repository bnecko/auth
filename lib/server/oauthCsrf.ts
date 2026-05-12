import { createHmac, timingSafeEqual } from "crypto";
import { oauthCsrfSecret } from "./config";

const MAX_AGE_SECONDS = 600;

// Stateless CSRF token for /oauth/authorize → approve/deny.
//
// The token is bound to (sessionId, clientId, state, issuedAt). An
// attacker who tries to pre-fill an approve form on a victim's
// browser cannot mint a valid token because they do not know the
// victim's session id. Stateless lets us survive a Redis outage and
// keeps the approve flow purely HTTP.
//
// Wire format:  `<issuedAt>.<hex32(hmac)>`
// Hmac:         HMAC-SHA256(secret, `${sessionId}:${clientId}:${state}:${issuedAt}`)

export function mintAuthorizeCsrf(input: {
  sessionId: number;
  clientId: string;
  state: string;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const sig = signCsrf({ ...input, issuedAt });
  return `${issuedAt}.${sig}`;
}

export function verifyAuthorizeCsrf(input: {
  token: string;
  sessionId: number;
  clientId: string;
  state: string;
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
    clientId: input.clientId,
    state: input.state,
    issuedAt,
  });
  const provided = Buffer.from(providedSig, "hex");
  const expected = Buffer.from(expectedSig, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

function signCsrf(input: {
  sessionId: number;
  clientId: string;
  state: string;
  issuedAt: number;
}) {
  const secret = oauthCsrfSecret();
  if (!secret) {
    throw new Error("oauthCsrfSecret is not configured");
  }
  return createHmac("sha256", secret)
    .update(`${input.sessionId}:${input.clientId}:${input.state}:${input.issuedAt}`)
    .digest("hex");
}

import { createHash, randomBytes } from "crypto";
import type { AuthorizationUrlInput, PkcePair } from "./types";

// RFC 7636 caps the verifier at 43-128 characters of [A-Za-z0-9-._~].
// 32 random bytes → 43 base64url chars sits at the floor of that range
// with full entropy.
export function generatePkcePair(): PkcePair {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge, method: "S256" };
}

export function buildAuthorizationUrl(
  issuer: string,
  input: AuthorizationUrlInput,
) {
  const base = issuer.replace(/\/+$/, "");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: input.scope,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  if (input.nonce) {
    params.set("nonce", input.nonce);
  }
  return `${base}/oauth/authorize?${params.toString()}`;
}

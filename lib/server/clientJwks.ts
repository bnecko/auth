import { createPublicKey, type KeyObject } from "crypto";

// JWKS fetch + cache + key selection for private_key_jwt client
// authentication. Clients self-host their public JWKS either inline
// (the `jwks` column on external_apps) or at a discoverable URL (the
// `jwks_uri` column). We cache fetched JWKS in-process for five
// minutes — long enough to absorb token-endpoint bursts, short enough
// to pick up a key rotation without operator action.

type Jwk = Record<string, unknown> & { kid?: string; kty?: string; use?: string };
type Jwks = { keys: Jwk[] };

type CacheEntry = { fetchedAt: number; jwks: Jwks };

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const cache = new Map<string, CacheEntry>();

async function fetchJwks(uri: string): Promise<Jwks> {
  const url = new URL(uri);
  if (url.protocol !== "https:") {
    throw new Error("jwks_uri must use https");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(uri, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`jwks_uri fetch failed: ${response.status}`);
    }
    const body = (await response.json()) as Jwks;
    if (!body || !Array.isArray(body.keys)) {
      throw new Error("jwks_uri did not return a JWKS object");
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function loadJwks(input: { jwks: unknown; jwksUri: string | null }): Promise<Jwks> {
  if (input.jwks && typeof input.jwks === "object") {
    const candidate = input.jwks as Jwks;
    if (Array.isArray(candidate.keys)) {
      return candidate;
    }
  }
  if (input.jwksUri) {
    const cached = cache.get(input.jwksUri);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.jwks;
    }
    const fresh = await fetchJwks(input.jwksUri);
    cache.set(input.jwksUri, { fetchedAt: Date.now(), jwks: fresh });
    return fresh;
  }
  throw new Error("client has no jwks or jwks_uri configured");
}

export async function resolveClientPublicKey(input: {
  jwks: unknown;
  jwksUri: string | null;
  kid?: string;
}): Promise<KeyObject> {
  const jwks = await loadJwks(input);
  const candidates = input.kid
    ? jwks.keys.filter(k => k.kid === input.kid)
    : jwks.keys;
  if (candidates.length === 0) {
    throw new Error("no matching key in client jwks");
  }
  // Try each candidate; return the first that imports as a usable
  // public key. Most clients publish exactly one key, but key
  // rollover briefly publishes two.
  for (const jwk of candidates) {
    try {
      return createPublicKey({ key: jwk as never, format: "jwk" });
    } catch {
      // Skip unparseable entries — JWKS can carry symmetric keys we
      // can't use for assertion verification.
    }
  }
  throw new Error("no usable RSA public key in client jwks");
}

// Test seam: lets unit tests reset the in-process cache between runs.
export function _resetJwksCacheForTests() {
  cache.clear();
}

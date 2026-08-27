import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildAuthorizationUrl, generatePkcePair } from "../dist/index.js";

test("verifier sits at the RFC 7636 43-char floor and the challenge matches", () => {
  const pair = generatePkcePair();

  assert.equal(pair.codeVerifier.length, 43);
  assert.match(pair.codeVerifier, /^[A-Za-z0-9_-]+$/);
  assert.equal(pair.method, "S256");
  assert.equal(
    pair.codeChallenge,
    createHash("sha256").update(pair.codeVerifier).digest("base64url"),
  );
});

test("authorization URL carries state and the S256 challenge", () => {
  const url = new URL(
    buildAuthorizationUrl("https://auth.test/", {
      clientId: "app_x",
      redirectUri: "https://app.test/cb",
      scope: "openid profile",
      state: "s123",
      codeChallenge: "c123",
      nonce: "n123",
    }),
  );

  assert.equal(url.origin + url.pathname, "https://auth.test/oauth/authorize");
  assert.equal(url.searchParams.get("state"), "s123");
  assert.equal(url.searchParams.get("code_challenge"), "c123");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("nonce"), "n123");
});

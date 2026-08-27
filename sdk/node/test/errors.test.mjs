import { test } from "node:test";
import assert from "node:assert/strict";
import { BottleneckAuthClient, BottleneckAuthError } from "../dist/index.js";

function clientWith(response) {
  return new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: async () => response,
  });
}

test("activation envelope: code is the stable code, error is the message", async () => {
  const client = clientWith(
    new Response(
      JSON.stringify({ error: "return url is not allowed", code: "return_url_not_allowed" }),
      { status: 400, headers: { "content-type": "application/json" } },
    ),
  );

  const err = await client
    .createActivationRequest({ apiKey: "sec_x" })
    .catch(e => e);

  assert.ok(err instanceof BottleneckAuthError);
  assert.equal(err.code, "return_url_not_allowed");
  assert.equal(err.message, "return url is not allowed");
  assert.equal(err.status, 400);
});

test("oauth envelope: error is the stable code, error_description is the message", async () => {
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    clientId: "app_x",
    clientSecret: "shh",
    fetch: async () =>
      new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "code verifier mismatch" }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
  });

  const err = await client
    .exchangeCode({ code: "c", redirectUri: "https://app.test/cb", codeVerifier: "v" })
    .catch(e => e);

  assert.ok(err instanceof BottleneckAuthError);
  assert.equal(err.code, "invalid_grant");
  assert.equal(err.message, "code verifier mismatch");
});

test("rate limited response carries retryAfterSeconds", async () => {
  const client = clientWith(
    new Response(JSON.stringify({ error: "rate limited", code: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "7" },
    }),
  );

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" })
    .catch(e => e);

  assert.equal(err.code, "rate_limited");
  assert.equal(err.status, 429);
  assert.equal(err.retryAfterSeconds, 7);
});

test("non-JSON error body falls back to status text", async () => {
  const client = clientWith(
    new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" }),
  );

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" })
    .catch(e => e);

  assert.ok(err instanceof BottleneckAuthError);
  assert.equal(err.code, "request_failed");
  assert.equal(err.status, 502);
  assert.equal(err.message, "502 Bad Gateway");
});

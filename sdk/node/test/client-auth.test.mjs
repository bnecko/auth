import { test } from "node:test";
import assert from "node:assert/strict";
import { BottleneckAuthClient } from "../dist/index.js";

const TOKEN_RESPONSE = JSON.stringify({
  access_token: "at",
  token_type: "Bearer",
  expires_in: 3600,
  scope: "openid",
});

// Captures the request the client sends and replies with a canned token.
function capture() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      body: new URLSearchParams(String(init.body)),
    });
    return new Response(TOKEN_RESPONSE, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

test("default confidential client sends client_secret_post", async () => {
  const { calls, fetchImpl } = capture();
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    clientId: "app_x",
    clientSecret: "shh",
    fetch: fetchImpl,
  });

  await client.exchangeCode({ code: "c", redirectUri: "https://app.test/cb", codeVerifier: "v" });

  const call = calls[0];
  assert.equal(call.url, "https://auth.test/api/oauth/token");
  assert.equal(call.headers.authorization, undefined);
  assert.equal(call.body.get("client_id"), "app_x");
  assert.equal(call.body.get("client_secret"), "shh");
  assert.equal(call.body.get("grant_type"), "authorization_code");
});

test("client_secret_basic sends Basic auth and no secret in the body", async () => {
  const { calls, fetchImpl } = capture();
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    clientId: "app_x",
    clientSecret: "shh",
    tokenEndpointAuthMethod: "client_secret_basic",
    fetch: fetchImpl,
  });

  await client.refreshToken({ refreshToken: "rt" });

  const call = calls[0];
  const expected = Buffer.from("app_x:shh").toString("base64");
  assert.equal(call.headers.authorization, `Basic ${expected}`);
  assert.equal(call.body.get("client_secret"), null);
  assert.equal(call.body.get("client_id"), null);
});

test("public client sends only client_id in the body", async () => {
  const { calls, fetchImpl } = capture();
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    clientId: "app_x",
    fetch: fetchImpl,
  });

  await client.exchangeCode({ code: "c", redirectUri: "https://app.test/cb", codeVerifier: "v" });

  const call = calls[0];
  assert.equal(call.headers.authorization, undefined);
  assert.equal(call.body.get("client_id"), "app_x");
  assert.equal(call.body.get("client_secret"), null);
});

test("introspect authenticates the same way as the token endpoint", async () => {
  const { calls, fetchImpl } = capture();
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    clientId: "app_x",
    clientSecret: "shh",
    fetch: fetchImpl,
  });

  await client.introspect("at");

  const call = calls[0];
  assert.equal(call.url, "https://auth.test/api/oauth/introspect");
  assert.equal(call.body.get("token"), "at");
  assert.equal(call.body.get("client_secret"), "shh");
});

test("revokeToken posts token and hint and resolves on an empty 200", async () => {
  const calls = [];
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    clientId: "app_x",
    clientSecret: "shh",
    fetch: async (url, init) => {
      calls.push({ url, body: new URLSearchParams(String(init.body)) });
      return new Response(null, { status: 200 });
    },
  });

  await client.revokeToken({ token: "rt", tokenTypeHint: "refresh_token" });

  const call = calls[0];
  assert.equal(call.url, "https://auth.test/api/oauth/revoke");
  assert.equal(call.body.get("token"), "rt");
  assert.equal(call.body.get("token_type_hint"), "refresh_token");
  assert.equal(call.body.get("client_secret"), "shh");
});

test("clientCredentialsGrant sends the grant and optional scope", async () => {
  const { calls, fetchImpl } = capture();
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    clientId: "app_x",
    clientSecret: "shh",
    fetch: fetchImpl,
  });

  await client.clientCredentialsGrant({ scope: "profile:read" });

  const call = calls[0];
  assert.equal(call.body.get("grant_type"), "client_credentials");
  assert.equal(call.body.get("scope"), "profile:read");
});

test("secret with method none is rejected at construction", () => {
  assert.throws(
    () =>
      new BottleneckAuthClient({
        issuer: "https://auth.test",
        clientId: "app_x",
        clientSecret: "shh",
        tokenEndpointAuthMethod: "none",
      }),
    /clientSecret must not be set/,
  );
});

test("secret-based method without a secret is rejected at construction", () => {
  assert.throws(
    () =>
      new BottleneckAuthClient({
        issuer: "https://auth.test",
        clientId: "app_x",
        tokenEndpointAuthMethod: "client_secret_basic",
      }),
    /clientSecret is required/,
  );
});

test("secret without clientId is rejected at construction", () => {
  assert.throws(
    () =>
      new BottleneckAuthClient({
        issuer: "https://auth.test",
        clientSecret: "shh",
      }),
    /clientId is required/,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { BottleneckAuthClient } from "../dist/index.js";

function capture(body, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers, body: init.body });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

test("createActivationRequest sends the Idempotency-Key header when given", async () => {
  const { calls, fetchImpl } = capture({ id: "act_1", token: "t", activationUrl: "u", expiresAt: "e" }, 201);
  const client = new BottleneckAuthClient({ issuer: "https://auth.test", fetch: fetchImpl });

  await client.createActivationRequest({
    apiKey: "sec_x",
    requestedSubject: "local-1",
    idempotencyKey: "retry-key-123",
  });

  const call = calls[0];
  assert.equal(call.url, "https://auth.test/api/activation-requests");
  assert.equal(call.headers.authorization, "Bearer sec_x");
  assert.equal(call.headers["idempotency-key"], "retry-key-123");
  assert.equal(JSON.parse(call.body).requestedSubject, "local-1");
});

// The server silently skips idempotency for out-of-range keys instead of
// rejecting them, so the SDK has to fail fast.
test("out-of-range idempotencyKey is rejected before any request", async () => {
  const { calls, fetchImpl } = capture({}, 201);
  const client = new BottleneckAuthClient({ issuer: "https://auth.test", fetch: fetchImpl });

  await assert.rejects(
    client.createActivationRequest({ apiKey: "sec_x", idempotencyKey: "abc" }),
    /idempotencyKey must be 8-255 characters/,
  );
  assert.equal(calls.length, 0);
});

test("createActivationRequest omits the Idempotency-Key header by default", async () => {
  const { calls, fetchImpl } = capture({ id: "act_1", token: "t", activationUrl: "u", expiresAt: "e" }, 201);
  const client = new BottleneckAuthClient({ issuer: "https://auth.test", fetch: fetchImpl });

  await client.createActivationRequest({ apiKey: "sec_x" });

  assert.equal(calls[0].headers["idempotency-key"], undefined);
});

test("status response surfaces revoked and deniedReason", async () => {
  const { fetchImpl } = capture({
    id: "act_1",
    status: "approved",
    approvedUserId: 123,
    revoked: true,
    deniedReason: null,
    expiresAt: "2026-08-27T00:00:00.000Z",
    profile: null,
  });
  const client = new BottleneckAuthClient({ issuer: "https://auth.test", fetch: fetchImpl });

  const status = await client.getActivationStatus({ apiKey: "sec_x", id: "act_1" });

  assert.equal(status.revoked, true);
  assert.equal(status.deniedReason, null);
});

test("revokeActivation posts to the revoke endpoint", async () => {
  const { calls, fetchImpl } = capture({ id: "act_1", revoked: true });
  const client = new BottleneckAuthClient({ issuer: "https://auth.test", fetch: fetchImpl });

  const result = await client.revokeActivation({ apiKey: "sec_x", id: "act_1" });

  assert.equal(calls[0].url, "https://auth.test/api/activation-requests/act_1/revoke");
  assert.equal(calls[0].method, "POST");
  assert.equal(result.revoked, true);
});

test("getAppConfig reads /api/apps/me", async () => {
  const { calls, fetchImpl } = capture({
    id: "app_1",
    name: "Test",
    slug: "test",
    status: "active",
    callbackUrl: null,
    allowedRedirectUrls: [],
    allowedScopes: ["profile:read"],
    requiredProduct: null,
  });
  const client = new BottleneckAuthClient({ issuer: "https://auth.test", fetch: fetchImpl });

  const config = await client.getAppConfig({ apiKey: "sec_x" });

  assert.equal(calls[0].url, "https://auth.test/api/apps/me");
  assert.deepEqual(config.allowedScopes, ["profile:read"]);
});

test("listActivationRequests filters by subject and status", async () => {
  const { calls, fetchImpl } = capture({ requests: [] });
  const client = new BottleneckAuthClient({ issuer: "https://auth.test", fetch: fetchImpl });

  await client.listActivationRequests({ apiKey: "sec_x", subject: "local 1", status: "approved" });

  assert.equal(
    calls[0].url,
    "https://auth.test/api/activation-requests?subject=local+1&status=approved",
  );
});

test("listAuthorizations reads /api/authorizations", async () => {
  const { calls, fetchImpl } = capture({
    authorizations: [{ subject: "usr_1", scopes: ["profile:read"], createdAt: "2026-08-27T00:00:00.000Z" }],
  });
  const client = new BottleneckAuthClient({ issuer: "https://auth.test", fetch: fetchImpl });

  const result = await client.listAuthorizations({ apiKey: "sec_x" });

  assert.equal(calls[0].url, "https://auth.test/api/authorizations");
  assert.equal(result.authorizations[0].subject, "usr_1");
});

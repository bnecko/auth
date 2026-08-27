const { test } = require("node:test");
const assert = require("node:assert/strict");
const sdk = require("../dist/index.cjs");

test("CommonJS build exposes the public API", () => {
  assert.equal(typeof sdk.BottleneckAuthClient, "function");
  assert.equal(typeof sdk.BottleneckAuthError, "function");
  assert.equal(typeof sdk.verifyWebhookSignature, "function");
  assert.equal(typeof sdk.generatePkcePair, "function");
  assert.equal(typeof sdk.buildAuthorizationUrl, "function");
});

test("CommonJS client construction works", () => {
  const client = new sdk.BottleneckAuthClient({ issuer: "https://auth.test" });
  assert.ok(client instanceof sdk.BottleneckAuthClient);
});

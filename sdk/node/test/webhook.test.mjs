import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../dist/index.js";

const secret = "whsec_test_0123456789abcdef";
const body = JSON.stringify({ id: "whd_xyz", type: "activation.approved" });

function sign(timestamp) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

test("fresh signed delivery verifies", () => {
  const timestamp = String(nowSeconds());
  assert.equal(
    verifyWebhookSignature({ secret, timestamp, body, signature: sign(timestamp) }),
    true,
  );
});

test("valid signature over a stale timestamp is rejected", () => {
  const timestamp = String(nowSeconds() - 600);
  assert.equal(
    verifyWebhookSignature({ secret, timestamp, body, signature: sign(timestamp) }),
    false,
  );
});

test("valid signature over a far-future timestamp is rejected", () => {
  const timestamp = String(nowSeconds() + 600);
  assert.equal(
    verifyWebhookSignature({ secret, timestamp, body, signature: sign(timestamp) }),
    false,
  );
});

test("toleranceSeconds widens the freshness window", () => {
  const timestamp = String(nowSeconds() - 600);
  assert.equal(
    verifyWebhookSignature({
      secret,
      timestamp,
      body,
      signature: sign(timestamp),
      toleranceSeconds: 900,
    }),
    true,
  );
});

test("malformed timestamps are rejected", () => {
  for (const timestamp of ["", "abc", "12.5", "-100", "1e10"]) {
    assert.equal(
      verifyWebhookSignature({ secret, timestamp, body, signature: sign(timestamp) }),
      false,
      `timestamp ${JSON.stringify(timestamp)} should be rejected`,
    );
  }
});

test("tampered body is rejected", () => {
  const timestamp = String(nowSeconds());
  assert.equal(
    verifyWebhookSignature({
      secret,
      timestamp,
      body: body.replace("approved", "denied"),
      signature: sign(timestamp),
    }),
    false,
  );
});

test("wrong secret is rejected", () => {
  const timestamp = String(nowSeconds());
  assert.equal(
    verifyWebhookSignature({
      secret: "whsec_other",
      timestamp,
      body,
      signature: sign(timestamp),
    }),
    false,
  );
});

test("signature of a different length is rejected", () => {
  const timestamp = String(nowSeconds());
  assert.equal(
    verifyWebhookSignature({ secret, timestamp, body, signature: "abc" }),
    false,
  );
});

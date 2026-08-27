import { test } from "node:test";
import assert from "node:assert/strict";
import { BottleneckAuthClient, BottleneckAuthError } from "../dist/index.js";

// Resolves only when aborted, rejecting with the abort reason like real fetch.
function hangingFetch(url, init) {
  return new Promise((resolve, reject) => {
    if (init.signal.aborted) {
      reject(init.signal.reason);
      return;
    }
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
}

test("timeout throws BottleneckAuthError with code timeout", async () => {
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: hangingFetch,
    timeoutMs: 20,
  });

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" })
    .catch(e => e);

  assert.ok(err instanceof BottleneckAuthError);
  assert.equal(err.code, "timeout");
  assert.equal(err.status, 0);
});

test("per-request timeoutMs overrides the client default", async () => {
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: hangingFetch,
    timeoutMs: 60_000,
  });

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" }, { timeoutMs: 20 })
    .catch(e => e);

  assert.equal(err.code, "timeout");
});

test("caller abort rethrows the caller's reason, not a BottleneckAuthError", async () => {
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: hangingFetch,
  });
  const controller = new AbortController();
  const reason = new Error("caller cancelled");
  setTimeout(() => controller.abort(reason), 10);

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" }, { signal: controller.signal })
    .catch(e => e);

  assert.equal(err, reason);
});

test("an already-aborted signal rejects immediately with its reason", async () => {
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: hangingFetch,
  });
  const controller = new AbortController();
  const reason = new Error("cancelled before start");
  controller.abort(reason);

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" }, { signal: controller.signal })
    .catch(e => e);

  assert.equal(err, reason);
});

test("transport failure wraps into BottleneckAuthError with the cause preserved", async () => {
  const cause = new TypeError("fetch failed");
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: async () => {
      throw cause;
    },
  });

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" })
    .catch(e => e);

  assert.ok(err instanceof BottleneckAuthError);
  assert.equal(err.code, "network_error");
  assert.equal(err.status, 0);
  assert.equal(err.cause, cause);
});

// Returns 200 headers immediately, then never delivers the body.
function stalledBodyFetch() {
  return Promise.resolve(
    new Response(new ReadableStream({ start() {} }), { status: 200 }),
  );
}

test("timeout covers a body that stalls after the headers arrive", async () => {
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: stalledBodyFetch,
    timeoutMs: 20,
  });

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" })
    .catch(e => e);

  assert.ok(err instanceof BottleneckAuthError);
  assert.equal(err.code, "timeout");
});

test("caller abort covers a body that stalls after the headers arrive", async () => {
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: stalledBodyFetch,
  });
  const controller = new AbortController();
  const reason = new Error("caller cancelled mid-body");
  setTimeout(() => controller.abort(reason), 10);

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" }, { signal: controller.signal })
    .catch(e => e);

  assert.equal(err, reason);
});

test("a 2xx response with a non-JSON body throws invalid_response", async () => {
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: async () => new Response("<html>ok</html>", { status: 200 }),
  });

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" })
    .catch(e => e);

  assert.ok(err instanceof BottleneckAuthError);
  assert.equal(err.code, "invalid_response");
  assert.equal(err.status, 200);
});

test("a connection dropped mid-body throws network_error", async () => {
  const cause = new TypeError("terminated");
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: async () =>
      new Response(new ReadableStream({ start(c) { c.error(cause); } }), { status: 200 }),
  });

  const err = await client
    .getActivationStatus({ apiKey: "sec_x", id: "act_1" })
    .catch(e => e);

  assert.ok(err instanceof BottleneckAuthError);
  assert.equal(err.code, "network_error");
});

test("the injected fetch is not invoked as a method of the transport", async () => {
  let receiver = "unset";
  function probeFetch(url, init) {
    receiver = this;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }
  const client = new BottleneckAuthClient({
    issuer: "https://auth.test",
    fetch: probeFetch,
  });

  await client.getActivationStatus({ apiKey: "sec_x", id: "act_1" });

  assert.equal(receiver, undefined);
});

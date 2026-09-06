import { describe, expect, it } from "vitest";
import {
  evaluateDiscovery,
  evaluateHeartbeat,
  evaluateReady,
  formatEvent,
  formatSummary,
  sameState,
  transition,
  type CheckState,
} from "../src/logic";

const T0 = Date.UTC(2026, 8, 6, 12, 0, 0);
const MIN = 60_000;

describe("evaluateHeartbeat", () => {
  it("is ok inside the grace period and stale beyond it", () => {
    expect(evaluateHeartbeat(T0 - 2 * MIN, T0, 3 * MIN)).toEqual({ ok: true, detail: "last seen 120s ago" });
    expect(evaluateHeartbeat(T0 - 4 * MIN, T0, 3 * MIN)).toEqual({ ok: false, detail: "last seen 240s ago" });
  });

  it("treats a source that never pinged as down", () => {
    expect(evaluateHeartbeat(null, T0, 3 * MIN)).toEqual({ ok: false, detail: "never seen" });
  });
});

describe("HTTP probes", () => {
  it("readiness needs 200 and an ok body", () => {
    expect(evaluateReady({ status: 200, body: '{"ok":true,"checks":{}}' }).ok).toBe(true);
    expect(evaluateReady({ status: 200, body: '{"ok":false}' })).toEqual({ ok: false, detail: "body reports not ok" });
    expect(evaluateReady({ status: 503, body: "" })).toEqual({ ok: false, detail: "status 503" });
    expect(evaluateReady(null)).toEqual({ ok: false, detail: "fetch failed" });
  });

  it("discovery needs the expected issuer", () => {
    const base = "https://auth.bneck.com";
    expect(evaluateDiscovery({ status: 200, body: `{"issuer":"${base}"}` }, base).ok).toBe(true);
    expect(evaluateDiscovery({ status: 200, body: '{"issuer":"http://localhost:3000"}' }, base)).toEqual({
      ok: false,
      detail: "issuer mismatch",
    });
  });
});

describe("transition", () => {
  const fail = { ok: false, detail: "status 503" };
  const pass = { ok: true, detail: "200 ok" };

  it("needs the configured number of consecutive failures before going down", () => {
    const first = transition(null, "http_ready", fail, T0, 2);
    expect(first.event).toBeNull();
    expect(first.next.status).toBe("up");
    expect(first.next.failures).toBe(1);

    const second = transition(first.next, "http_ready", fail, T0 + MIN, 2);
    expect(second.event).toBe("down");
    expect(second.next).toMatchObject({ status: "down", since: T0 + MIN, failures: 2 });
  });

  it("a success in between resets the failure count", () => {
    const first = transition(null, "http_ready", fail, T0, 2);
    const recovered = transition(first.next, "http_ready", pass, T0 + MIN, 2);
    expect(recovered.event).toBeNull();
    expect(recovered.next.failures).toBe(0);
  });

  it("stays down without repeating the event, then recovers once", () => {
    const down: CheckState = { name: "heartbeat_worker", status: "down", since: T0, failures: 1, detail: "never seen" };
    const still = transition(down, "heartbeat_worker", fail, T0 + MIN, 1);
    expect(still.event).toBeNull();
    expect(still.next.status).toBe("down");
    expect(still.next.failures).toBe(2);

    const back = transition(still.next, "heartbeat_worker", pass, T0 + 7 * MIN, 1);
    expect(back.event).toBe("recovered");
    expect(back.next).toMatchObject({ status: "up", since: T0 + 7 * MIN, failures: 0 });
  });

  it("heartbeats go down on the first stale observation (threshold 1)", () => {
    expect(transition(null, "heartbeat_bot", fail, T0, 1).event).toBe("down");
  });
});

describe("sameState", () => {
  it("detects unchanged rows so nothing is written", () => {
    const a: CheckState = { name: "http_ready", status: "up", since: T0, failures: 0, detail: "200 ok" };
    expect(sameState(a, { ...a })).toBe(true);
    expect(sameState(a, { ...a, failures: 1 })).toBe(false);
    expect(sameState(null, a)).toBe(false);
  });
});

describe("messages", () => {
  it("formats down and recovered with the outage duration", () => {
    const down: CheckState = { name: "http_ready", status: "down", since: T0, failures: 2, detail: "status 503" };
    expect(formatEvent("down", down, null, T0)).toBe("DOWN: readiness probe\nstatus 503");
    const up: CheckState = { ...down, status: "up", since: T0 + 95 * MIN, failures: 0, detail: "200 ok" };
    expect(formatEvent("recovered", up, T0, T0 + 95 * MIN)).toBe("RECOVERED: readiness probe after 1h 35m\n200 ok");
  });

  it("summarises up and down counts", () => {
    const states: CheckState[] = [
      { name: "http_ready", status: "up", since: T0, failures: 0, detail: null },
      { name: "heartbeat_bot", status: "down", since: T0 - 30 * MIN, failures: 3, detail: "never seen" },
    ];
    expect(formatSummary(states, T0)).toBe("External monitor: 1/2 checks up\nDOWN: bot heartbeat for 30m");
    expect(formatSummary([states[0]], T0)).toBe("External monitor: 1/1 checks up");
  });
});

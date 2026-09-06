// Pure decision logic for the monitor, kept free of bindings so it is
// testable with plain vitest. index.ts does the I/O.

export type CheckName = "http_ready" | "http_discovery" | "heartbeat_worker" | "heartbeat_bot";
export const CHECK_NAMES: CheckName[] = ["http_ready", "http_discovery", "heartbeat_worker", "heartbeat_bot"];
export const HEARTBEAT_SOURCES = ["worker", "bot"] as const;
export type HeartbeatSource = (typeof HEARTBEAT_SOURCES)[number];

export type Verdict = { ok: boolean; detail: string };
export type CheckState = {
  name: CheckName;
  status: "up" | "down";
  since: number;
  failures: number;
  detail: string | null;
};
export type Transition = { next: CheckState; event: "down" | "recovered" | null };
export type ProbeResult = { status: number; body: string } | null;

export function evaluateHeartbeat(lastSeenAt: number | null, now: number, graceMs: number): Verdict {
  if (lastSeenAt === null) return { ok: false, detail: "never seen" };
  const age = now - lastSeenAt;
  return age <= graceMs
    ? { ok: true, detail: `last seen ${Math.round(age / 1000)}s ago` }
    : { ok: false, detail: `last seen ${Math.round(age / 1000)}s ago` };
}

export function evaluateReady(result: ProbeResult): Verdict {
  if (!result) return { ok: false, detail: "fetch failed" };
  if (result.status !== 200) return { ok: false, detail: `status ${result.status}` };
  if (!result.body.includes('"ok":true')) return { ok: false, detail: "body reports not ok" };
  return { ok: true, detail: "200 ok" };
}

export function evaluateDiscovery(result: ProbeResult, issuer: string): Verdict {
  if (!result) return { ok: false, detail: "fetch failed" };
  if (result.status !== 200) return { ok: false, detail: `status ${result.status}` };
  if (!result.body.includes(`"issuer":"${issuer}"`)) return { ok: false, detail: "issuer mismatch" };
  return { ok: true, detail: "200 issuer ok" };
}

// A check flips to down after `failuresToAlert` consecutive failures and
// back to up on the first success; events fire only on the flip, so a
// persisting outage is one message, not one per tick. Heartbeats pass 1
// because their grace period already absorbs a single late ping.
export function transition(
  prev: CheckState | null,
  name: CheckName,
  verdict: Verdict,
  now: number,
  failuresToAlert: number,
): Transition {
  if (verdict.ok) {
    if (prev && prev.status === "down") {
      return { next: { name, status: "up", since: now, failures: 0, detail: verdict.detail }, event: "recovered" };
    }
    return { next: { name, status: "up", since: prev?.since ?? now, failures: 0, detail: verdict.detail }, event: null };
  }

  const failures = (prev?.failures ?? 0) + 1;
  if (prev && prev.status === "down") {
    return { next: { ...prev, failures, detail: verdict.detail }, event: null };
  }
  if (failures >= failuresToAlert) {
    return { next: { name, status: "down", since: now, failures, detail: verdict.detail }, event: "down" };
  }
  return { next: { name, status: "up", since: prev?.since ?? now, failures, detail: verdict.detail }, event: null };
}

export function sameState(a: CheckState | null, b: CheckState): boolean {
  return (
    a !== null &&
    a.status === b.status &&
    a.since === b.since &&
    a.failures === b.failures &&
    (a.detail ?? null) === (b.detail ?? null)
  );
}

const LABELS: Record<CheckName, string> = {
  http_ready: "readiness probe",
  http_discovery: "discovery document",
  heartbeat_worker: "worker heartbeat",
  heartbeat_bot: "bot heartbeat",
};

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatEvent(event: "down" | "recovered", state: CheckState, prevSince: number | null, now: number): string {
  const label = LABELS[state.name];
  if (event === "down") return `DOWN: ${label}\n${state.detail ?? ""}`.trim();
  const outage = prevSince === null ? "" : ` after ${duration(now - prevSince)}`;
  return `RECOVERED: ${label}${outage}\n${state.detail ?? ""}`.trim();
}

export function formatSummary(states: CheckState[], now: number): string {
  const up = states.filter(s => s.status === "up").length;
  const down = states.filter(s => s.status === "down");
  const head = `External monitor: ${up}/${states.length} checks up`;
  if (down.length === 0) return head;
  return `${head}\nDOWN: ${down.map(s => `${LABELS[s.name]} for ${duration(now - s.since)}`).join(", ")}`;
}

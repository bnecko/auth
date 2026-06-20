import { describe, it, expect } from "vitest";
import { canRevokeOtherSessions } from "@/lib/sessionPolicy";

const HOUR = 60 * 60 * 1000;
const now = 1_000_000_000_000;

function s(id: number, ageHours: number) {
  return { id, createdAt: new Date(now - ageHours * HOUR).toISOString() };
}

describe("canRevokeOtherSessions", () => {
  it("allows a session that is at least 24h old", () => {
    const sessions = [s(1, 30), s(2, 1)];
    expect(canRevokeOtherSessions(2, sessions, now)).toBe(false); // 1h old, not oldest
    expect(canRevokeOtherSessions(1, sessions, now)).toBe(true); // 30h old
  });

  it("allows the oldest session even when nothing is 24h old", () => {
    const sessions = [s(1, 5), s(2, 2), s(3, 1)];
    expect(canRevokeOtherSessions(1, sessions, now)).toBe(true); // oldest
    expect(canRevokeOtherSessions(2, sessions, now)).toBe(false);
    expect(canRevokeOtherSessions(3, sessions, now)).toBe(false);
  });

  it("a lone fresh session is the oldest, so it can manage", () => {
    const sessions = [s(7, 0.5)];
    expect(canRevokeOtherSessions(7, sessions, now)).toBe(true);
  });

  it("returns false when the current session is not in the list", () => {
    expect(canRevokeOtherSessions(99, [s(1, 48)], now)).toBe(false);
  });
});

import type { Session } from "@/lib/server/types";

const ESTABLISHED_MS = 24 * 60 * 60 * 1000;

// A session may revoke OTHER sessions only once it is "established": at least 24
// hours old, OR the oldest active session (so a brand-new account, where every
// session is fresh, can still manage from its first one). This stops a freshly
// stolen session from instantly evicting the legitimate user's sessions.
export function canRevokeOtherSessions(
  currentSessionId: number,
  sessions: Pick<Session, "id" | "createdAt">[],
  now: number = Date.now(),
): boolean {
  const current = sessions.find(s => s.id === currentSessionId);
  if (!current) return false;
  if (now - Date.parse(current.createdAt) >= ESTABLISHED_MS) return true;
  const oldest = sessions.reduce((a, b) =>
    Date.parse(a.createdAt) <= Date.parse(b.createdAt) ? a : b,
  );
  return oldest.id === currentSessionId;
}

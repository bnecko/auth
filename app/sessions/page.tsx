import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { listSessionsForUser } from "@/lib/server/repositories/sessions";
import { revokeSessionAction } from "@/app/dashboard-actions";
import { revokeOtherSessionsAction } from "@/app/security/actions";

export const dynamic = "force-dynamic";

function shortDate(value: string | null) {
  return value ? value.slice(0, 10) : "never";
}

export default async function SessionsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;
  const sessions = await listSessionsForUser(u.id);

  return (
    <AppShell
      user={{ name: u.firstName, username: u.username }}
      trail="Sessions"
      isAdmin={u.role === "admin"}
    >
      <header data-mount-row className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Sessions</h1>
        <p className="text-[13px] text-muted">Devices currently signed in</p>
      </header>

      <Section
        title="Sessions"
        hint="Signed-in browsers"
        action={
          <form action={revokeOtherSessionsAction}>
            <button className="text-[13px] text-secondary hover:text-danger transition-colors">
              Revoke others
            </button>
          </form>
        }
      >
        {sessions.map(session => (
          <Row key={session.id}>
            <RowLabel>{session.userAgent || "Unknown browser"}</RowLabel>
            <RowValue>
              <span className="text-secondary truncate">{session.ip || "Unknown IP"}</span>
              <span className="text-muted">·</span>
              <span className="text-muted">{shortDate(session.lastSeenAt)}</span>
              {session.id === current.session.id && <Tag tone="success">This device</Tag>}
            </RowValue>
            <form action={revokeSessionAction}>
              <input type="hidden" name="sessionId" value={session.id} />
              <button
                type="submit"
                className="text-[13px] text-secondary hover:text-danger transition-colors disabled:text-faint disabled:hover:text-faint disabled:cursor-not-allowed"
                disabled={session.id === current.session.id}
              >
                Revoke
              </button>
            </form>
          </Row>
        ))}
      </Section>
    </AppShell>
  );
}

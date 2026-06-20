import { redirect } from "next/navigation";
import { MonitorSmartphone } from "lucide-react";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Button } from "@/components/Button";
import { getCurrentSession } from "@/lib/server/session";
import { listSessionsForUser } from "@/lib/server/repositories/sessions";
import { revokeSessionAction } from "@/app/dashboard-actions";
import { revokeOtherSessionsAction } from "@/app/security/actions";

export const dynamic = "force-dynamic";

function relativeTime(value: string | null) {
  if (!value) return "never";
  const then = Date.parse(value);
  if (Number.isNaN(then)) return "never";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return value.slice(0, 10);
}

export default async function SessionsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;
  const sessions = await listSessionsForUser(u.id);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Sessions</h1>
        <p className="text-[13px] text-muted">Devices currently signed in</p>
      </header>

      <Section
        title="Sessions"
        icon={MonitorSmartphone}
        hint="Signed-in browsers"
        action={
          <form action={revokeOtherSessionsAction}>
            <Button type="submit" variant="danger" size="sm">
              Revoke others
            </Button>
          </form>
        }
      >
        {sessions.map(session => (
          <Row key={session.id}>
            <RowLabel>{session.userAgent || "Unknown browser"}</RowLabel>
            <RowValue>
              <span className="text-secondary truncate">{session.ip || "Unknown IP"}</span>
              <span className="text-muted">·</span>
              <span className="text-muted" title={session.lastSeenAt || undefined}>
                Last active {relativeTime(session.lastSeenAt)}
              </span>
              {session.id === current.session.id && <Tag tone="success">This device</Tag>}
            </RowValue>
            <form action={revokeSessionAction}>
              <input type="hidden" name="sessionId" value={session.id} />
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={session.id === current.session.id}
              >
                Revoke
              </Button>
            </form>
          </Row>
        ))}
      </Section>
    </>
  );
}

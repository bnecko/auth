import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Section, Empty } from "@/components/Section";
import { getCurrentSession } from "@/lib/server/session";
import { recentEventsForUser } from "@/lib/server/repositories/securityEvents";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;
  const events = await recentEventsForUser(u.id);

  return (
    <AppShell
      user={{ name: u.firstName, username: u.username }}
      trail="Recent events"
      isAdmin={u.role === "admin"}
    >
      <header data-mount-row className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Recent events</h1>
        <p className="text-[13px] text-muted">Security activity on your account</p>
      </header>

      <Section title="Recent events" hint="Last security activity">
        {events.length === 0 ? (
          <Empty>No recent events</Empty>
        ) : (
          <ul>
            {events.map((event, index) => (
              <li
                key={`${event.created_at}-${index}`}
                className="grid grid-cols-[180px_1fr_auto] gap-4 px-4 py-2.5 items-baseline border-t border-rule first:border-t-0 text-[13px]"
              >
                <span className="text-muted tabular-nums">
                  {event.created_at.slice(0, 16).replace("T", " ")}
                </span>
                <span className="text-fg">{event.event_type}</span>
                <span className="text-[12px] text-muted truncate max-w-[280px]">
                  {event.ip || event.result}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AppShell>
  );
}

import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { query } from "@/lib/server/db";
import { getCurrentSession } from "@/lib/server/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getSecurityEvents() {
  return query<{
    event_type: string;
    result: string;
    ip: string | null;
    username: string | null;
    created_at: string;
  }>(
    `select se.event_type, se.result, se.ip, u.username, se.created_at::text
       from security_events se
       left join users u on u.id = se.user_id
      order by se.created_at desc
      limit 200`,
  );
}

const resultTone: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  approved: "success",
  denied: "danger",
  success: "success",
  failure: "danger",
  banned: "danger",
  rejected: "danger",
};

export default async function AdminSecurityPage() {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") redirect("/");

  const events = await getSecurityEvents();

  return (
    <main className="flex-1 max-w-[960px] w-full mx-auto px-6 py-10">
      <header className="mb-7">
        <h1 className="text-[26px] tracking-tightest text-fg leading-none">
          Security Events
        </h1>
      </header>

      <Section title={`last ${events.length} events`}>
        {events.length === 0 ? (
          <Empty>no events</Empty>
        ) : (
          events.map((ev, i) => (
            <div
              key={i}
              className="border-b border-border last:border-0 px-4 py-2.5 flex items-center gap-4 text-[13px]"
            >
              <div className="w-[180px] shrink-0 text-fg font-mono text-[12px]">
                {ev.event_type}
              </div>
              <Tag tone={resultTone[ev.result] ?? "neutral"}>{ev.result}</Tag>
              <div className="flex-1 min-w-0 text-muted truncate">
                {ev.username ? `@${ev.username}` : ""}
                {ev.ip ? ` · ${ev.ip}` : ""}
              </div>
              <div className="text-faint text-meta shrink-0">
                {ev.created_at?.slice(0, 16).replace("T", " ")}
              </div>
            </div>
          ))
        )}
      </Section>
    </main>
  );
}

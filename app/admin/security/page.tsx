import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { searchSecurityEvents } from "@/lib/server/repositories/securityEvents";
import { getCurrentSession } from "@/lib/server/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const resultTone: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  approved: "success",
  denied: "danger",
  success: "success",
  failure: "danger",
  banned: "danger",
  rejected: "danger",
};

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") redirect("/");

  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] || "" : value || "";
  };
  const filters = {
    eventType: first("event"),
    result: first("result"),
    username: first("user"),
    ip: first("ip"),
    limit: Number(first("limit") || 200),
  };
  const events = await searchSecurityEvents(filters);
  const exportParams = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) exportParams.set(key, String(value));
  }

  return (
    <main className="flex-1 max-w-[960px] w-full mx-auto px-6 py-10">
      <header className="mb-7 flex items-end justify-between gap-4">
        <h1 className="text-[26px] tracking-tightest text-fg leading-none">
          Audit Console
        </h1>
        <a
          href={`/admin/security/export?${exportParams.toString()}`}
          className="text-meta text-secondary hover:text-fg transition-colors"
        >
          export csv
        </a>
      </header>

      <form className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-5">
        {[
          ["event", "event type"],
          ["result", "result"],
          ["user", "username"],
          ["ip", "ip"],
          ["limit", "limit"],
        ].map(([name, label]) => (
          <label key={name} className="block">
            <span className="block text-micro uppercase text-faint mb-1">{label}</span>
            <input
              name={name}
              defaultValue={String(filters[name === "event" ? "eventType" : name as keyof typeof filters] || "")}
              className="w-full h-9 rounded-sm border border-border bg-surface px-2 text-[13px] text-fg"
            />
          </label>
        ))}
        <button className="md:col-start-5 h-9 rounded-sm bg-fg text-bg text-[12px] font-medium">
          filter
        </button>
      </form>

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
              <div className="hidden lg:block max-w-[220px] truncate text-meta text-faint">
                {Object.keys(ev.metadata || {}).length
                  ? JSON.stringify(ev.metadata)
                  : ""}
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

import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Button } from "@/components/Button";
import { searchSecurityEvents } from "@/lib/server/repositories/securityEvents";
import { getCurrentSession } from "@/lib/server/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const resultTone: Record<
  string,
  "success" | "danger" | "warning" | "neutral"
> = {
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
    <>
      <header
        className="mb-10 flex items-end justify-between gap-4"
        data-mount-row
      >
        <div>
          <p className="text-[13px] text-muted mb-2">
            Admin / Audit
            <span className="ml-2 tabular-nums text-faint">
              {events.length}
            </span>
          </p>
          <h1 className="text-[32px] tracking-tight text-fg leading-none">
            Audit console
          </h1>
        </div>
        <a href={`/admin/security/export?${exportParams.toString()}`}>
          <Button variant="secondary" size="sm">
            Export CSV
          </Button>
        </a>
      </header>

      <form
        className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_120px_auto] gap-4 mb-8"
        data-mount-row
      >
        {[
          ["event", "Event type"],
          ["result", "Result"],
          ["user", "Username"],
          ["ip", "IP"],
          ["limit", "Limit"],
        ].map(([name, label]) => (
          <label key={name} className="block">
            <span className="block text-[12px] text-muted mb-1">{label}</span>
            <input
              name={name}
              defaultValue={String(
                filters[
                  name === "event" ? "eventType" : (name as keyof typeof filters)
                ] || "",
              )}
              className="w-full bg-card border border-rule rounded-md px-2 h-8 text-[13px] text-fg placeholder:text-faint focus:outline-hidden focus:border-accent transition-colors"
            />
          </label>
        ))}
        <Button type="submit" className="self-end h-8! px-3!">
          Filter
        </Button>
      </form>

      <div data-mount-row>
        <Section index="1.0" title="Events" hint={`last ${events.length}`}>
          {events.length === 0 ? (
            <Empty>No events</Empty>
          ) : (
            events.map((ev, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto] gap-3 items-start border-t border-rule first:border-t-0 py-3 px-4 text-[13px]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-fg truncate">{ev.event_type}</span>
                    <Tag tone={resultTone[ev.result] ?? "neutral"}>{ev.result}</Tag>
                  </div>
                  <div className="min-w-0 truncate text-[12px] text-muted">
                    {ev.username && <span className="text-secondary">@{ev.username}</span>}
                    {ev.username && ev.ip && <span className="text-faint"> · </span>}
                    {ev.ip && <span>{ev.ip}</span>}
                    {Object.keys(ev.metadata || {}).length > 0 && (
                      <span className="text-faint" title={JSON.stringify(ev.metadata)}>
                        {" · "}
                        {JSON.stringify(ev.metadata)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-faint tabular-nums text-[12px] whitespace-nowrap shrink-0 pt-0.5">
                  {ev.created_at?.slice(0, 16).replace("T", " ")}
                </div>
              </div>
            ))
          )}
        </Section>
      </div>
    </>
  );
}

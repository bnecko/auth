import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
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
    <main
      className="flex-1 max-w-[1120px] w-full mx-auto px-6 py-10"
      data-mount-stagger
    >
      <header
        className="mb-10 flex items-end justify-between gap-4"
        data-mount-row
      >
        <div>
          <div className="flex items-baseline gap-2 mb-2 text-meta">
            <span className="text-danger">$</span>
            <span className="uppercase tracking-wider text-muted">
              admin.audit
            </span>
            <span className="text-faint">·</span>
            <span className="text-meta text-faint tabular-nums">
              {String(events.length).padStart(2, "0")}
            </span>
          </div>
          <h1 className="text-[32px] tracking-tightest text-fg leading-none">
            audit console
          </h1>
        </div>
        <a
          href={`/admin/security/export?${exportParams.toString()}`}
          className="text-meta uppercase tracking-wider text-secondary hover:text-accent transition-colors flex items-baseline gap-1.5"
        >
          <Glyph kind="prompt" />
          <span>export csv</span>
        </a>
      </header>

      <form
        className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_120px_auto] gap-4 mb-8"
        data-mount-row
      >
        {[
          ["event", "event type"],
          ["result", "result"],
          ["user", "username"],
          ["ip", "ip"],
          ["limit", "limit"],
        ].map(([name, label]) => (
          <label key={name} className="block">
            <span className="block text-meta uppercase tracking-wider text-muted mb-1">
              {label}
            </span>
            <input
              name={name}
              defaultValue={String(
                filters[
                  name === "event" ? "eventType" : (name as keyof typeof filters)
                ] || "",
              )}
              className="w-full bg-transparent border-0 border-b border-rule px-1 h-8 text-[13px] text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
            />
          </label>
        ))}
        <Button type="submit" className="self-end !h-8 !px-3">
          filter
        </Button>
      </form>

      <div data-mount-row>
        <Section index="1.0" title="events" hint={`last ${events.length}`}>
          {events.length === 0 ? (
            <Empty>no events</Empty>
          ) : (
            events.map((ev, i) => (
              <div
                key={i}
                className="grid grid-cols-[180px_90px_1fr_140px] gap-4 items-baseline border-t border-rule first:border-t-0 py-2.5 px-1 text-meta"
              >
                <div className="text-fg truncate">{ev.event_type}</div>
                <Tag tone={resultTone[ev.result] ?? "neutral"}>{ev.result}</Tag>
                <div className="min-w-0 text-muted truncate flex items-baseline gap-2">
                  {ev.username && (
                    <span className="text-secondary">@{ev.username}</span>
                  )}
                  {ev.username && ev.ip && <Glyph kind="dot" />}
                  {ev.ip && <span>{ev.ip}</span>}
                  {Object.keys(ev.metadata || {}).length > 0 && (
                    <>
                      <Glyph kind="dot" />
                      <code className="text-faint truncate">
                        {JSON.stringify(ev.metadata)}
                      </code>
                    </>
                  )}
                </div>
                <div className="text-faint tabular-nums text-right">
                  {ev.created_at?.slice(0, 16).replace("T", " ")}
                </div>
              </div>
            ))
          )}
        </Section>
      </div>
    </main>
  );
}

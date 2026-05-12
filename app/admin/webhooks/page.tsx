import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
import { getCurrentSession } from "@/lib/server/session";
import {
  listRecentWebhookDeliveries,
  type WebhookDeliveryStatus,
} from "@/lib/server/repositories/webhooks";
import { redirect } from "next/navigation";
import Link from "next/link";
import { retryWebhookDeliveryAction } from "./actions";

export const dynamic = "force-dynamic";

const statusTone: Record<
  WebhookDeliveryStatus,
  "success" | "danger" | "warning" | "neutral"
> = {
  delivered: "success",
  failed: "danger",
  pending: "warning",
  cancelled: "neutral",
};

const FILTERS: { label: string; value: WebhookDeliveryStatus | "all" }[] = [
  { label: "all", value: "all" },
  { label: "pending", value: "pending" },
  { label: "delivered", value: "delivered" },
  { label: "failed", value: "failed" },
];

export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") redirect("/");

  const { status } = await searchParams;
  const filter = (FILTERS.find(f => f.value === status)?.value || "all") as
    | WebhookDeliveryStatus
    | "all";

  const deliveries = await listRecentWebhookDeliveries({
    limit: 200,
    status: filter === "all" ? undefined : filter,
  });

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
              admin.webhooks
            </span>
            <span className="text-faint">·</span>
            <span className="text-meta text-faint tabular-nums">
              {String(deliveries.length).padStart(2, "0")}
            </span>
          </div>
          <h1 className="text-[32px] tracking-tightest text-fg leading-none">
            webhook deliveries
          </h1>
        </div>
        <nav className="flex items-baseline gap-1 text-meta uppercase tracking-wider">
          {FILTERS.map(f => (
            <Link
              key={f.value}
              href={
                f.value === "all"
                  ? "/admin/webhooks"
                  : `/admin/webhooks?status=${f.value}`
              }
              className={`px-2 h-7 leading-7 transition-colors flex items-baseline gap-1.5 ${
                filter === f.value
                  ? "text-accent"
                  : "text-secondary hover:text-fg"
              }`}
            >
              {filter === f.value && <span className="text-accent">■</span>}
              <span>{f.label}</span>
            </Link>
          ))}
        </nav>
      </header>

      <div data-mount-row>
        <Section
          index="1.0"
          title="deliveries"
          hint={filter === "all" ? "most recent" : `filtered: ${filter}`}
        >
          {deliveries.length === 0 ? (
            <Empty>no deliveries</Empty>
          ) : (
            deliveries.map(d => (
              <div
                key={d.publicId}
                className="grid grid-cols-[1fr_120px_80px] gap-4 items-baseline border-t border-rule first:border-t-0 py-2.5 px-1 text-meta"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-fg">{d.appName}</span>
                    <span className="text-faint">→</span>
                    <code className="text-secondary truncate">
                      {d.endpointUrl}
                    </code>
                    <Tag tone={statusTone[d.status]}>{d.status}</Tag>
                  </div>
                  <div className="text-muted mt-0.5 truncate">
                    <span className="text-faint">{d.eventType}</span>
                    <Glyph kind="dot" className="mx-2" />
                    attempt {d.attemptCount}
                    {d.responseStatus !== null && (
                      <>
                        <Glyph kind="dot" className="mx-2" />
                        http {d.responseStatus}
                      </>
                    )}
                    {d.lastError && (
                      <>
                        <Glyph kind="dot" className="mx-2" />
                        <span className="text-danger">
                          {d.lastError.slice(0, 80)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-faint tabular-nums text-right">
                  {d.createdAt?.slice(0, 16).replace("T", " ")}
                </div>
                <div className="text-right">
                  {(d.status === "failed" || d.status === "pending") && (
                    <form action={retryWebhookDeliveryAction}>
                      <input
                        type="hidden"
                        name="public_id"
                        value={d.publicId}
                      />
                      <button
                        type="submit"
                        className="text-meta uppercase tracking-wider text-secondary hover:text-accent transition-colors"
                      >
                        retry
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))
          )}
        </Section>
      </div>
    </main>
  );
}

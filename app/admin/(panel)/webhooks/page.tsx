import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Button } from "@/components/Button";
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
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Delivered", value: "delivered" },
  { label: "Failed", value: "failed" },
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
    <>
      <header
        className="mb-10 flex items-end justify-between gap-4"
        data-mount-row
      >
        <div>
          <p className="text-[13px] text-muted mb-2">
            admin / webhooks
            <span className="ml-2 tabular-nums text-faint">
              {deliveries.length}
            </span>
          </p>
          <h1 className="text-[32px] tracking-tight text-fg leading-none">
            Webhook deliveries
          </h1>
        </div>
        <nav className="flex items-baseline gap-1 text-[13px]">
          {FILTERS.map(f => (
            <Link
              key={f.value}
              href={
                f.value === "all"
                  ? "/admin/webhooks"
                  : `/admin/webhooks?status=${f.value}`
              }
              className={`px-2.5 h-7 leading-7 rounded-md transition-colors flex items-center gap-1.5 ${
                filter === f.value
                  ? "bg-hover text-fg font-medium"
                  : "text-secondary hover:text-fg"
              }`}
            >
              <span>{f.label}</span>
            </Link>
          ))}
        </nav>
      </header>

      <div data-mount-row>
        <Section
          index="1.0"
          title="Deliveries"
          hint={filter === "all" ? "most recent" : `filtered: ${filter}`}
        >
          {deliveries.length === 0 ? (
            <Empty>No deliveries</Empty>
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
                    <span className="mx-2 text-faint">·</span>
                    Attempt {d.attemptCount}
                    {d.responseStatus !== null && (
                      <>
                        <span className="mx-2 text-faint">·</span>
                        HTTP {d.responseStatus}
                      </>
                    )}
                    {d.lastError && (
                      <>
                        <span className="mx-2 text-faint">·</span>
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
                      <Button type="submit" variant="ghost" size="sm">
                        Retry
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            ))
          )}
        </Section>
      </div>
    </>
  );
}

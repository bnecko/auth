import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { listRecentWebhookDeliveries, type WebhookDeliveryStatus } from "@/lib/server/repositories/webhooks";
import { redirect } from "next/navigation";
import Link from "next/link";
import { retryWebhookDeliveryAction } from "./actions";

export const dynamic = "force-dynamic";

const statusTone: Record<WebhookDeliveryStatus, "success" | "danger" | "warning" | "neutral"> = {
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
    <main className="flex-1 max-w-[1080px] w-full mx-auto px-6 py-10">
      <header className="mb-7 flex items-baseline justify-between">
        <h1 className="text-[26px] tracking-tightest text-fg leading-none">
          Webhook deliveries
        </h1>
        <div className="flex items-center gap-3 text-meta">
          {FILTERS.map(f => (
            <Link
              key={f.value}
              href={f.value === "all" ? "/admin/webhooks" : `/admin/webhooks?status=${f.value}`}
              className={`px-2 h-7 leading-7 rounded-sm transition-colors ${
                filter === f.value
                  ? "bg-elevated text-fg"
                  : "text-secondary hover:text-fg hover:bg-hover"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </header>

      <Section title={`last ${deliveries.length}`}>
        {deliveries.length === 0 ? (
          <Empty>no deliveries</Empty>
        ) : (
          deliveries.map(d => (
            <div
              key={d.publicId}
              className="border-b border-border last:border-0 px-4 py-2.5 flex items-center gap-4 text-[13px]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-fg">{d.appName}</span>
                  <span className="text-muted text-meta">→</span>
                  <code className="text-muted text-meta truncate">{d.endpointUrl}</code>
                  <Tag tone={statusTone[d.status]} bracket={false}>
                    {d.status}
                  </Tag>
                </div>
                <div className="text-muted text-meta mt-0.5 truncate">
                  {d.eventType} · attempt {d.attemptCount}
                  {d.responseStatus !== null && ` · HTTP ${d.responseStatus}`}
                  {d.lastError && ` · ${d.lastError.slice(0, 100)}`}
                </div>
              </div>
              <div className="text-faint text-meta shrink-0">
                {d.createdAt?.slice(0, 16).replace("T", " ")}
              </div>
              {(d.status === "failed" || d.status === "pending") && (
                <form action={retryWebhookDeliveryAction}>
                  <input type="hidden" name="public_id" value={d.publicId} />
                  <button
                    type="submit"
                    className="text-meta text-secondary hover:text-fg transition-colors"
                  >
                    retry
                  </button>
                </form>
              )}
            </div>
          ))
        )}
      </Section>
    </main>
  );
}

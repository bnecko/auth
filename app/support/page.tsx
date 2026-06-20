import Link from "next/link";
import { listPublicThreads } from "@/lib/server/services/support";
import { SupportThreadList } from "@/components/SupportThreadList";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active =
    status === "open" || status === "resolved" || status === "closed" ? status : undefined;
  const threads = await listPublicThreads(active);

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[28px] tracking-tight text-fg leading-none mb-1.5">
          Community support
        </h1>
        <p className="text-[13px] text-muted">
          Public issues and questions - anyone can read; sign in to post or star.
        </p>
      </header>

      <div className="flex items-center gap-1 mb-4 border-b border-rule">
        {TABS.map(tab => {
          const isActive = (active ?? "") === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.key ? `/support?status=${tab.key}` : "/support"}
              className={`px-3 h-9 inline-flex items-center text-[13px] -mb-px border-b-2 transition-colors ${
                isActive
                  ? "border-accent text-fg font-medium"
                  : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <SupportThreadList threads={threads} empty="No threads here yet." />
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";
import { canHandleSupport } from "@/lib/server/supporterAuth";
import { listMyThreads } from "@/lib/server/services/support";
import { SupportThreadList } from "@/components/SupportThreadList";

export const dynamic = "force-dynamic";

export default async function MySupportThreadsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login?next=/support/mine");

  const [threads, staff] = await Promise.all([
    listMyThreads(current.user.id),
    canHandleSupport(current.user),
  ]);

  return (
    <>
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] tracking-tight text-fg leading-none mb-1.5">
            My threads
          </h1>
          <p className="text-[13px] text-muted">Threads you opened</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {staff && (
            <Link
              href="/support/queue"
              className="h-8 px-3 inline-flex items-center rounded-md text-[13px] text-secondary border border-rule bg-card hover:bg-hover hover:text-fg transition-colors"
            >
              Supporter queue
            </Link>
          )}
          <Link
            href="/support/new"
            className="h-8 px-3 inline-flex items-center rounded-md text-[13px] text-fg bg-accent hover:brightness-95 transition"
          >
            New thread
          </Link>
        </div>
      </header>

      <SupportThreadList threads={threads} empty="You haven't opened any threads yet." />
    </>
  );
}

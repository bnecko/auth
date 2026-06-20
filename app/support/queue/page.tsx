import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";
import { canHandleSupport } from "@/lib/server/supporterAuth";
import { listQueue } from "@/lib/server/services/support";
import { SupportThreadList } from "@/components/SupportThreadList";

export const dynamic = "force-dynamic";

export default async function SupportQueuePage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login?next=/support/queue");
  if (!(await canHandleSupport(current.user))) redirect("/support");

  const threads = await listQueue(current.user);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[28px] tracking-tight text-fg leading-none mb-1.5">
          Supporter queue
        </h1>
        <p className="text-[13px] text-muted">
          Open and in-progress threads you can act on.
        </p>
      </header>

      <SupportThreadList threads={threads} empty="Nothing in the queue." />
    </>
  );
}

import { listPublicThreads } from "@/lib/server/services/support";
import { SupportThreadList } from "@/components/SupportThreadList";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const threads = await listPublicThreads();

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[28px] tracking-tight text-fg leading-none mb-1.5">
          Community support
        </h1>
        <p className="text-[13px] text-muted">
          Public issues and questions — anyone can read; sign in to post or star.
        </p>
      </header>

      <SupportThreadList threads={threads} empty="No public threads yet." />
    </>
  );
}

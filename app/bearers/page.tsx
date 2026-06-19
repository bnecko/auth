import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BearerSection } from "@/components/BearerSection";
import { getCurrentSession } from "@/lib/server/session";
import { listBearerRequestsForUser } from "@/lib/server/repositories/bearerRequests";

export const dynamic = "force-dynamic";

export default async function BearersPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;
  const bearers = await listBearerRequestsForUser(u.id);

  return (
    <AppShell
      user={{ name: u.firstName, username: u.username }}
      trail="API bearers"
      isAdmin={u.role === "admin"}
    >
      <header data-mount-row className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">API bearers</h1>
          <p className="text-[13px] text-muted">Long-lived tokens for server-to-server access</p>
        </div>
        <Link
          href="/request-bearer"
          className="shrink-0 inline-flex items-center h-9 px-4 rounded-md bg-accent text-fg text-[13px] font-medium hover:brightness-95 transition"
        >
          Request bearer
        </Link>
      </header>

      <div data-mount-row>
        <BearerSection bearers={bearers} />
      </div>
    </AppShell>
  );
}

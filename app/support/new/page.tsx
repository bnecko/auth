import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";
import { NewThreadForm } from "./NewThreadForm";

export const dynamic = "force-dynamic";

export default async function NewSupportThreadPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login?next=/support/new");

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[28px] tracking-tight text-fg leading-none mb-1.5">
          Start a support thread
        </h1>
        <p className="text-[13px] text-muted">
          Open a public community issue or a private support ticket.
        </p>
      </header>

      <div className="rounded-xl ring-1 ring-rule bg-card p-5">
        <NewThreadForm />
      </div>
    </>
  );
}

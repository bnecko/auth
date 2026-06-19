import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentSession } from "@/lib/server/session";
import { ClientForm } from "./ClientForm";

export const dynamic = "force-dynamic";

export default async function NewAppPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login?next=/developers/apps/new");
  }

  return (
    <AppShell
      user={{
        name: current.user.firstName,
        username: current.user.username,
      }}
      trail="New app"
    >
      <div className="max-w-[720px]">
        <header className="mb-10" data-mount-row>
          <h1 className="text-[32px] text-fg leading-none mb-3">
            New application
          </h1>
          <p className="text-[15px] text-muted max-w-prose">
            Register a new OAuth client to authenticate users and access APIs.
          </p>
        </header>

        <div data-mount-row>
          <ClientForm />
        </div>
      </div>
    </AppShell>
  );
}

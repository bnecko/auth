import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { getCurrentSession } from "@/lib/server/session";
import { ClientForm } from "./ClientForm";

export const dynamic = "force-dynamic";

export default async function NewAppPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login?next=/developers/apps/new");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{
          name: current.user.firstName,
          username: current.user.username,
        }}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopNav trail="developers / apps / new" />
        <main
          className="flex-1 p-6 lg:p-10 max-w-[720px] mx-auto w-full"
          data-mount-stagger
        >
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
        </main>
      </div>
    </div>
  );
}

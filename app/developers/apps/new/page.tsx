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
        <main className="flex-1 p-6 lg:p-10 max-w-[800px] mx-auto w-full">
          <div className="mb-8">
            <h1 className="text-[30px] tracking-tightest text-fg leading-none mb-2">
              Create Application
            </h1>
            <p className="text-muted text-[13px]">
              Register a new OAuth client to authenticate users and access APIs.
            </p>
          </div>

          <ClientForm />
        </main>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { TestLab } from "./test-lab";

export const dynamic = "force-dynamic";

export default async function TestLabPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login?next=/developers/test-lab");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{
          name: current.user.firstName,
          username: current.user.username,
        }}
      />
      <div className="flex-1 min-w-0">
        <TopNav trail="developers / test field lab" />
        <main className="max-w-[1120px] mx-auto px-6 py-10">
          <header className="mb-10">
            <div className="flex items-baseline gap-2 mb-2 text-meta">
              <span className="text-accent">$</span>
              <span className="uppercase tracking-wider text-muted">
                oauth.lab
              </span>
              <span className="text-faint">·</span>
              <Tag tone="info">api lab</Tag>
            </div>
            <h1 className="text-[36px] leading-none tracking-tightest text-fg mb-3">
              test field lab
            </h1>
            <p className="text-meta text-muted leading-6 max-w-[680px]">
              build an authorization url, generate pkce values, inspect
              discovery metadata, and test token endpoints against this auth
              server.
            </p>
          </header>

          <TestLab />
        </main>
      </div>
    </div>
  );
}

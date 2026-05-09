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
          <header className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-micro uppercase text-faint">developer</span>
              <Tag tone="info">api lab</Tag>
            </div>
            <h1 className="text-[30px] leading-none tracking-tightest text-fg">
              Test field lab
            </h1>
            <p className="mt-3 text-[13px] leading-6 text-muted max-w-[760px]">
              Build an authorization URL, generate PKCE values, inspect
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

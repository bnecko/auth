import { redirect } from "next/navigation";
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
    <>
      <header className="mb-10">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[13px] text-muted">OAuth lab</span>
          <Tag tone="info">API lab</Tag>
        </div>
        <h1 className="text-[36px] leading-none tracking-tight text-fg mb-3">
          Test field lab
        </h1>
        <p className="text-[14px] text-muted leading-6 max-w-[680px]">
          Build an authorization URL, generate PKCE values, inspect
          discovery metadata, and test token endpoints against this auth
          server.
        </p>
      </header>

      <TestLab />
    </>
  );
}

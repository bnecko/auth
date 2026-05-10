import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/Button";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { query } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export default async function DeveloperAppsPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login?next=/developers/apps");
  }

  // Fetch apps owned by this user
  const apps = await query<{
    name: string;
    slug: string;
    public_id: string;
    created_at: string;
    status: string;
  }>(
    `select name, slug, public_id, created_at::text, status
     from external_apps
     where owner_user_id = $1
     order by created_at desc`,
    [current.user.id]
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{
          name: current.user.firstName,
          username: current.user.username,
        }}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopNav trail="developers / apps" />
        <main className="flex-1 p-6 lg:p-10 max-w-[1040px] mx-auto w-full">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="text-micro uppercase text-faint mb-2">
                developer portal
              </div>
              <h1 className="text-[30px] tracking-tightest text-fg leading-none">
                OAuth Apps
              </h1>
            </div>
            <Link href="/developers/apps/new" className="inline-flex items-center justify-center h-9 px-4 rounded-sm bg-fg text-bg font-medium text-[13px] hover:bg-fg/90 transition-colors">
              Create App
            </Link>
          </div>

          <div className="border border-border bg-surface rounded-sm">
            {apps.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-muted text-[13px] mb-4">
                  You haven't created any applications yet.
                </p>
                <Link href="/developers/apps/new" className="inline-flex items-center justify-center h-9 px-4 rounded-sm border border-border text-fg font-medium text-[13px] hover:bg-hover transition-colors">
                  Create your first app
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {apps.map((app) => (
                  <Link
                    key={app.slug}
                    href={`/developers/apps/${app.slug}`}
                    className="flex items-center justify-between px-5 py-4 hover:bg-hover transition-colors group"
                  >
                    <div>
                      <div className="text-fg font-medium text-[14px] flex items-center gap-2">
                        {app.name}
                        {app.status === "disabled" && <Tag tone="danger">disabled</Tag>}
                      </div>
                      <div className="text-muted text-[13px] mt-1 flex items-center gap-2">
                        <span className="font-mono text-[12px] bg-bg px-1.5 py-0.5 rounded border border-border">
                          {app.public_id}
                        </span>
                        <span className="text-faint">•</span>
                        <span>{app.created_at.slice(0, 10)}</span>
                      </div>
                    </div>
                    <div className="text-faint group-hover:text-secondary transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

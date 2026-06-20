import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/Button";
import { Tag } from "@/components/Tag";
import { Section, Empty } from "@/components/Section";
import { getCurrentSession } from "@/lib/server/session";
import { query } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export default async function DeveloperAppsPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login?next=/developers/apps");
  }

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
    [current.user.id],
  );

  return (
    <>
      <header className="flex items-end justify-between mb-10">
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[13px] text-muted">Developer / apps</span>
            <span className="text-[13px] text-faint tabular-nums">
              {apps.length} app{apps.length === 1 ? "" : "s"}
            </span>
          </div>
          <h1 className="text-[32px] tracking-tight text-fg leading-none">
            OAuth apps
          </h1>
        </div>
        <Link href="/developers/apps/new">
          <Button>+ New app</Button>
        </Link>
      </header>

      <div>
        <Section
          index="1.0"
          title="Registered apps"
          hint="OAuth clients you own"
          icon={LayoutGrid}
        >
          {apps.length === 0 ? (
            <Empty>No apps registered yet</Empty>
          ) : (
            apps.map(app => (
              <Link
                key={app.slug}
                href={`/developers/apps/${app.slug}`}
                className="grid grid-cols-[1fr_auto_120px] gap-4 px-4 py-3 border-t border-rule first:border-t-0 items-center text-[13px] group hover:bg-hover transition-colors"
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-fg group-hover:text-accent-strong transition-colors truncate">
                    {app.name}
                  </span>
                  {app.status === "disabled" && (
                    <Tag tone="danger">Disabled</Tag>
                  )}
                </div>
                <span className="text-[13px] text-muted truncate">
                  {app.public_id}
                </span>
                <span className="text-[13px] text-faint tabular-nums">
                  {app.created_at.slice(0, 10)}
                </span>
              </Link>
            ))
          )}
        </Section>
      </div>
    </>
  );
}

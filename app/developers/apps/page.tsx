import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/Button";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
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
    <div className="flex min-h-screen">
      <Sidebar
        user={{
          name: current.user.firstName,
          username: current.user.username,
        }}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopNav
          trail="developers / apps"
          isAdmin={current.user.role === "admin"}
        />
        <main
          className="flex-1 p-6 lg:p-10 max-w-[1040px] mx-auto w-full"
          data-mount-stagger
        >
          <header
            className="flex items-end justify-between mb-10"
            data-mount-row
          >
            <div>
              <div className="flex items-baseline gap-2 mb-2 text-meta">
                <span className="text-accent">$</span>
                <span className="uppercase tracking-wider text-muted">
                  developer.apps
                </span>
                <span className="text-faint">·</span>
                <span className="text-meta text-faint tabular-nums">
                  {String(apps.length).padStart(2, "0")} app
                  {apps.length === 1 ? "" : "s"}
                </span>
              </div>
              <h1 className="text-[32px] tracking-tightest text-fg leading-none">
                oauth apps
              </h1>
            </div>
            <Link href="/developers/apps/new">
              <Button>+ new app</Button>
            </Link>
          </header>

          <div data-mount-row>
            <Section
              index="1.0"
              title="registered apps"
              hint="oauth clients you own"
            >
              {apps.length === 0 ? (
                <Empty>no apps registered yet</Empty>
              ) : (
                apps.map(app => (
                  <Link
                    key={app.slug}
                    href={`/developers/apps/${app.slug}`}
                    className="grid grid-cols-[1fr_220px_140px_auto] gap-4 px-1 py-3.5 border-t border-rule first:border-t-0 items-center text-[13px] group hover:text-accent transition-colors"
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-fg group-hover:text-accent transition-colors truncate">
                        {app.name}
                      </span>
                      {app.status === "disabled" && (
                        <Tag tone="danger">disabled</Tag>
                      )}
                    </div>
                    <span className="text-meta text-muted truncate">
                      {app.public_id}
                    </span>
                    <span className="text-meta text-faint tabular-nums">
                      {app.created_at.slice(0, 10)}
                    </span>
                    <Glyph
                      kind="prompt"
                      className="text-faint group-hover:text-accent transition-colors"
                    />
                  </Link>
                ))
              )}
            </Section>
          </div>
        </main>
      </div>
    </div>
  );
}

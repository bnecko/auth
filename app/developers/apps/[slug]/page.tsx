import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Button } from "@/components/Button";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { queryOne } from "@/lib/server/db";
import { updateAppAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AppSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login?next=/developers/apps");
  }

  const { slug } = await params;

  const app = await queryOne<{
    id: number;
    name: string;
    public_id: string;
    allowed_redirect_urls: string[];
    status: string;
    created_at: string;
  }>(
    `select id, name, public_id, allowed_redirect_urls, status, created_at::text
     from external_apps
     where slug = $1 and owner_user_id = $2`,
    [slug, current.user.id]
  );

  if (!app) {
    redirect("/developers/apps");
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
        <TopNav trail={`developers / apps / ${app.name}`} />
        <main className="flex-1 p-6 lg:p-10 max-w-[800px] mx-auto w-full">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-[30px] tracking-tightest text-fg leading-none">
                {app.name}
              </h1>
              {app.status === "disabled" && <Tag tone="danger">Disabled</Tag>}
            </div>
            <p className="text-muted text-[13px] font-mono">
              Client ID: {app.public_id}
            </p>
          </div>

          <div className="space-y-6">
            <section className="border border-border bg-surface rounded-sm p-6">
              <h2 className="text-micro uppercase tracking-[0.08em] text-muted mb-4">
                Configuration
              </h2>
              
              <form action={updateAppAction} className="space-y-4">
                <input type="hidden" name="app_id" value={app.id} />
                
                <div>
                  <label className="block text-[13px] font-medium text-fg mb-1.5">
                    Allowed Redirect URIs (one per line)
                  </label>
                  <textarea
                    name="redirect_uris"
                    rows={4}
                    defaultValue={app.allowed_redirect_urls.join("\n")}
                    className="w-full rounded-sm border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-border font-mono"
                  ></textarea>
                  <p className="text-faint text-[12px] mt-1.5">
                    Must be strict HTTPS URLs where you expect to receive authorization codes.
                  </p>
                </div>

                <div className="pt-2">
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </section>

            <section className="border border-border bg-surface rounded-sm p-6">
              <h2 className="text-micro uppercase tracking-[0.08em] text-muted mb-4">
                Danger Zone
              </h2>
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-[14px] text-fg font-medium">Rotate Client Secret</div>
                  <div className="text-[13px] text-muted">Invalidates the current secret and generates a new one.</div>
                </div>
                <form action={updateAppAction}>
                  <input type="hidden" name="app_id" value={app.id} />
                  <input type="hidden" name="action" value="rotate_secret" />
                  <Button variant="ghost" type="submit" className="text-danger hover:bg-danger/10">Rotate</Button>
                </form>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

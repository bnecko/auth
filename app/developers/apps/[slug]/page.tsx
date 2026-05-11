import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { queryOne } from "@/lib/server/db";
import { AppSettingsForm } from "./AppSettingsForm";

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
    oauth_profile_version: string;
    status: string;
    created_at: string;
  }>(
    `select id, name, public_id, allowed_redirect_urls, oauth_profile_version, status, created_at::text
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

          <AppSettingsForm
            appId={app.id}
            redirectUris={app.allowed_redirect_urls}
            oauthProfileVersion={app.oauth_profile_version}
          />
        </main>
      </div>
    </div>
  );
}

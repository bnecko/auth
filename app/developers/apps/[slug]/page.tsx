import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { getCurrentSession } from "@/lib/server/session";
import { queryOne } from "@/lib/server/db";
import { listWebhookEndpointsForApp } from "@/lib/server/repositories/webhooks";
import { AppSettingsForm } from "./AppSettingsForm";
import { CopyValue } from "./CopyValue";
import { WebhookEndpointsSection } from "./WebhookEndpointsSection";

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
    [slug, current.user.id],
  );

  if (!app) {
    redirect("/developers/apps");
  }

  const webhookEndpoints = await listWebhookEndpointsForApp(app.id);
  const initials = app.name.slice(0, 2).toUpperCase();

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
          trail={`developers / apps / ${app.name}`}
          isAdmin={current.user.role === "admin"}
        />
        <main
          className="flex-1 p-6 lg:p-10 max-w-[860px] mx-auto w-full"
          data-mount-stagger
        >
          <header
            className="flex items-start gap-5 mb-10"
            data-mount-row
          >
            <div
              className="h-16 w-16 border border-accent flex items-center justify-center text-accent text-[20px] tracking-wider shrink-0"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 mb-2 text-meta">
                <span className="text-accent">$</span>
                <span className="uppercase tracking-wider text-muted">
                  app.settings
                </span>
                {app.status === "disabled" && (
                  <>
                    <span className="text-faint">·</span>
                    <Tag tone="danger">disabled</Tag>
                  </>
                )}
              </div>
              <h1 className="text-[32px] tracking-tightest text-fg leading-none mb-2 truncate">
                {app.name}
              </h1>
              <p className="text-meta text-muted">
                client id: <CopyValue value={app.public_id} label="client id" />
              </p>
            </div>
          </header>

          <div data-mount-row>
            <Section
              index="1.0"
              title="identifiers"
              hint="immutable oauth credentials"
            >
              <Row>
                <RowLabel>client id</RowLabel>
                <RowValue>
                  <CopyValue value={app.public_id} label="client id" />
                </RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>slug</RowLabel>
                <RowValue>
                  <span className="text-fg">{slug}</span>
                </RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>created</RowLabel>
                <RowValue>
                  <span className="text-muted tabular-nums">
                    {app.created_at.slice(0, 16).replace("T", " ")}
                  </span>
                </RowValue>
                <span />
              </Row>
            </Section>
          </div>

          <div data-mount-row>
            <AppSettingsForm
              appId={app.id}
              redirectUris={app.allowed_redirect_urls}
              oauthProfileVersion={app.oauth_profile_version}
            />
          </div>

          <div data-mount-row>
            <WebhookEndpointsSection
              appId={app.id}
              endpoints={webhookEndpoints.map(e => ({
                publicId: e.publicId,
                url: e.url,
                eventTypes: e.eventTypes,
                status: e.status,
                createdAt: e.createdAt,
              }))}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

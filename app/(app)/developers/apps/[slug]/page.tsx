import { redirect } from "next/navigation";
import { Tag } from "@/components/Tag";
import { KeyRound } from "lucide-react";
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
    <>
      <header
        className="flex items-start gap-5 mb-10"
      >
        <div
          className="h-16 w-16 rounded-lg border border-rule bg-bg-soft flex items-center justify-center text-accent-strong text-[20px] font-semibold shrink-0"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] text-muted">App settings</span>
            {app.status === "disabled" && (
              <Tag tone="danger">Disabled</Tag>
            )}
          </div>
          <h1 className="text-[32px] tracking-tight text-fg leading-none mb-2 truncate">
            {app.name}
          </h1>
          <p className="text-[13px] text-muted">
            Client ID: <CopyValue value={app.public_id} label="client id" />
          </p>
        </div>
      </header>

      <div>
        <Section
          index="1.0"
          title="Identifiers"
          hint="Immutable OAuth credentials"
          icon={KeyRound}
        >
          <Row>
            <RowLabel>Client ID</RowLabel>
            <RowValue>
              <CopyValue value={app.public_id} label="client id" />
            </RowValue>
            <span />
          </Row>
          <Row>
            <RowLabel>Slug</RowLabel>
            <RowValue>
              <span className="text-fg">{slug}</span>
            </RowValue>
            <span />
          </Row>
          <Row>
            <RowLabel>Created</RowLabel>
            <RowValue>
              <span className="text-muted tabular-nums">
                {app.created_at.slice(0, 16).replace("T", " ")}
              </span>
            </RowValue>
            <span />
          </Row>
        </Section>
      </div>

      <div>
        <AppSettingsForm
          appId={app.id}
          redirectUris={app.allowed_redirect_urls}
          oauthProfileVersion={app.oauth_profile_version}
        />
      </div>

      <div>
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
    </>
  );
}

import { redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getCurrentSession } from "@/lib/server/session";
import { listAuthorizationsForUser } from "@/lib/server/repositories/authorizations";
import { revokeAppAction } from "@/app/dashboard-actions";
import { revokeAllOAuthGrantsAction } from "@/app/security/actions";

export const dynamic = "force-dynamic";

function shortDate(value: string | null) {
  return value ? value.slice(0, 10) : "never";
}

export default async function ConnectedAppsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;
  const apps = await listAuthorizationsForUser(u.id);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Connected apps</h1>
        <p className="text-[13px] text-muted">External apps with access to your account</p>
      </header>

      <Section
        title="Connected apps"
        icon={LayoutGrid}
        hint="OAuth grants"
        action={
          apps.length > 0 ? (
            <ConfirmButton
              action={revokeAllOAuthGrantsAction}
              label="Revoke all"
              triggerVariant="danger"
              tone="danger"
              title="Revoke all connected apps?"
              message="Every external app loses access to your account. You can reconnect them later."
              confirmLabel="Revoke all"
            />
          ) : undefined
        }
      >
        {apps.length === 0 ? (
          <Empty>No connected apps</Empty>
        ) : (
          apps.map(app => (
            <Row key={app.appSlug}>
              <RowLabel>{app.appName}</RowLabel>
              <RowValue>
                <span className="text-secondary truncate">{app.scopes.join(", ")}</span>
                <span className="text-muted">·</span>
                <span className="text-muted">Since {shortDate(app.createdAt)}</span>
              </RowValue>
              <ConfirmButton
                action={revokeAppAction}
                fields={{ appSlug: app.appSlug }}
                label="Revoke"
                triggerVariant="danger"
                tone="danger"
                title={`Revoke ${app.appName}?`}
                message="This app loses access to your account. You can reconnect it later."
                confirmLabel="Revoke access"
              />
            </Row>
          ))
        )}
      </Section>
    </>
  );
}

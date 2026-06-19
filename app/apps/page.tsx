import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
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
    <AppShell
      user={{ name: u.firstName, username: u.username }}
      trail="Connected apps"
      isAdmin={u.role === "admin"}
    >
      <header data-mount-row className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Connected apps</h1>
        <p className="text-[13px] text-muted">External apps with access to your account</p>
      </header>

      <Section
        title="Connected apps"
        hint="OAuth grants"
        action={
          apps.length > 0 ? (
            <form action={revokeAllOAuthGrantsAction}>
              <button className="text-[13px] text-secondary hover:text-danger transition-colors">
                Revoke all
              </button>
            </form>
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
              <form action={revokeAppAction}>
                <input type="hidden" name="appSlug" value={app.appSlug} />
                <button
                  type="submit"
                  className="text-[13px] text-secondary hover:text-danger transition-colors"
                >
                  Revoke
                </button>
              </form>
            </Row>
          ))
        )}
      </Section>
    </AppShell>
  );
}

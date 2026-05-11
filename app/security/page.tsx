import Link from "next/link";
import { redirect } from "next/navigation";
import { PasskeyManager } from "@/components/PasskeyManager";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { Sidebar } from "@/components/Sidebar";
import { Tag } from "@/components/Tag";
import { TopNav } from "@/components/TopNav";
import { findWebauthnCredentialsByUser } from "@/lib/server/repositories/webauthn";
import { getCurrentSession } from "@/lib/server/session";
import { getDashboard } from "@/lib/server/services/dashboard";
import {
  revokeAllOAuthGrantsAction,
  revokeOtherSessionsAction,
} from "./actions";

export const dynamic = "force-dynamic";

function shortDate(value: string | null) {
  return value ? value.slice(0, 16).replace("T", " ") : "never";
}

export default async function SecurityCenterPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login?next=/security");
  }

  const [dashboard, passkeys] = await Promise.all([
    getDashboard(current.user),
    findWebauthnCredentialsByUser(current.user.id),
  ]);

  const hasTelegram = Boolean(current.user.telegramVerifiedAt);

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: current.user.firstName, username: current.user.username }} />
      <div className="flex-1 min-w-0">
        <TopNav trail="security center" />
        <main className="max-w-[960px] mx-auto px-6 py-10">
          <header className="mb-9">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-micro uppercase text-faint">account security</span>
              <Tag tone={hasTelegram ? "success" : "warning"}>
                {hasTelegram ? "2fa enabled" : "2fa missing"}
              </Tag>
            </div>
            <h1 className="text-[28px] tracking-tightest text-fg leading-none">
              Security Center
            </h1>
            <p className="mt-3 text-meta text-muted max-w-prose">
              Sessions, OAuth grants, passkeys, Telegram 2FA, and recent security activity.
            </p>
          </header>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border rounded-sm overflow-hidden mb-10">
            {[
              { label: "sessions", value: dashboard.sessions.length },
              { label: "oauth grants", value: dashboard.apps.length },
              { label: "passkeys", value: passkeys.length },
              { label: "events", value: dashboard.events.length },
            ].map(item => (
              <div key={item.label} className="bg-surface px-4 py-3">
                <div className="text-micro uppercase text-faint">{item.label}</div>
                <div className="text-[24px] text-fg tabular-nums tracking-tightest mt-1">
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <Section title="sessions" hint="// signed-in browsers">
            <form action={revokeOtherSessionsAction} className="border-b border-border px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-[13px] text-secondary">
                End every active session except this browser.
              </span>
              <button className="text-meta text-secondary hover:text-danger transition-colors">
                revoke others
              </button>
            </form>
            {dashboard.sessions.map(session => (
              <Row key={session.id}>
                <RowLabel>{session.userAgent || "unknown browser"}</RowLabel>
                <RowValue>
                  <span className="text-secondary">{session.ip || "unknown ip"}</span>
                  <span className="text-faint">/</span>
                  <span className="text-muted">{shortDate(session.lastSeenAt)}</span>
                  {session.id === current.session.id && <Tag tone="success">this device</Tag>}
                </RowValue>
                <span />
              </Row>
            ))}
          </Section>

          <Section title="oauth grants" hint="// apps with account access">
            <form action={revokeAllOAuthGrantsAction} className="border-b border-border px-4 py-3 flex items-center justify-between gap-4">
              <span className="text-[13px] text-secondary">
                Revoke every OAuth authorization and related active token.
              </span>
              <button className="text-meta text-secondary hover:text-danger transition-colors">
                revoke all
              </button>
            </form>
            {dashboard.apps.length === 0 ? (
              <Empty>no connected apps</Empty>
            ) : (
              dashboard.apps.map(app => (
                <Row key={app.appSlug}>
                  <RowLabel>{app.appName}</RowLabel>
                  <RowValue>{app.scopes.join(", ")}</RowValue>
                  <span className="text-meta text-muted">{shortDate(app.createdAt)}</span>
                </Row>
              ))
            )}
          </Section>

          <Section title="telegram 2fa" hint="// linked recovery channel">
            <Row>
              <RowLabel>status</RowLabel>
              <RowValue>
                {hasTelegram
                  ? `enabled ${shortDate(current.user.telegramVerifiedAt)}`
                  : "not linked"}
              </RowValue>
              <Link href="/relink" className="text-meta text-secondary hover:text-fg transition-colors">
                relink
              </Link>
            </Row>
          </Section>

          <Section title="passkeys" hint="// passwordless credentials">
            <PasskeyManager
              passkeys={passkeys.map(item => ({
                id: item.credentialId,
                name: item.name || "Unknown Device",
                lastUsed: item.lastUsedAt,
              }))}
            />
          </Section>

          <Section title="recent activity" hint="// security events">
            {dashboard.events.length === 0 ? (
              <Empty>no recent events</Empty>
            ) : (
              <ul className="text-[12.5px] divide-y divide-border">
                {dashboard.events.map((event, index) => (
                  <li
                    key={`${event.created_at}-${index}`}
                    className="grid grid-cols-[180px_1fr_auto] gap-4 px-4 py-2.5 items-center"
                  >
                    <span className="text-muted tabular-nums">{shortDate(event.created_at)}</span>
                    <span className="text-fg">{event.event_type}</span>
                    <span className="text-meta text-muted">{event.result}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </main>
      </div>
    </div>
  );
}

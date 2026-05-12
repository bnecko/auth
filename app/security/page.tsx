import Link from "next/link";
import { redirect } from "next/navigation";
import { PasskeyManager } from "@/components/PasskeyManager";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { Sidebar } from "@/components/Sidebar";
import { Tag } from "@/components/Tag";
import { TopNav } from "@/components/TopNav";
import { Glyph } from "@/components/Glyph";
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
      <Sidebar
        user={{
          name: current.user.firstName,
          username: current.user.username,
        }}
      />
      <div className="flex-1 min-w-0">
        <TopNav trail="security center" />
        <main
          className="max-w-[960px] mx-auto px-6 py-10"
          data-mount-stagger
        >
          <header className="mb-10" data-mount-row>
            <div className="flex items-baseline gap-2 mb-2 text-meta">
              <span className="text-accent">$</span>
              <span className="uppercase tracking-wider text-muted">
                security.center
              </span>
              <span className="text-faint">·</span>
              <Tag tone={hasTelegram ? "success" : "warning"}>
                {hasTelegram ? "2fa enabled" : "2fa missing"}
              </Tag>
            </div>
            <h1 className="text-[32px] tracking-tightest text-fg leading-none mb-3">
              security center
            </h1>
            <p className="text-meta text-muted max-w-prose">
              sessions, oauth grants, passkeys, telegram 2fa, and recent
              security activity.
            </p>
          </header>

          <div
            className="grid grid-cols-2 md:grid-cols-4 border-t border-b border-rule mb-12"
            data-mount-row
          >
            {[
              { label: "sessions", value: dashboard.sessions.length },
              { label: "oauth grants", value: dashboard.apps.length },
              { label: "passkeys", value: passkeys.length },
              { label: "events", value: dashboard.events.length },
            ].map((item, i) => (
              <div
                key={item.label}
                className={`px-1 py-4 ${
                  i > 0 ? "border-l border-rule" : ""
                }`}
              >
                <div className="text-meta uppercase tracking-wider text-muted mb-1">
                  {item.label}
                </div>
                <div className="text-[34px] text-accent tabular-nums tracking-tightest leading-none">
                  {String(item.value).padStart(2, "0")}
                </div>
              </div>
            ))}
          </div>

          <div data-mount-row>
            <Section
              index="1.0"
              title="sessions"
              hint="signed-in browsers"
              action={
                <form action={revokeOtherSessionsAction}>
                  <button className="text-meta uppercase tracking-wider text-secondary hover:text-danger transition-colors">
                    revoke others
                  </button>
                </form>
              }
            >
              {dashboard.sessions.map(session => (
                <Row key={session.id}>
                  <RowLabel>{session.userAgent || "unknown browser"}</RowLabel>
                  <RowValue>
                    <span className="text-secondary">
                      {session.ip || "unknown ip"}
                    </span>
                    <Glyph kind="dot" />
                    <span className="text-muted">
                      {shortDate(session.lastSeenAt)}
                    </span>
                    {session.id === current.session.id && (
                      <Tag tone="success">this device</Tag>
                    )}
                  </RowValue>
                  <span />
                </Row>
              ))}
            </Section>
          </div>

          <div data-mount-row>
            <Section
              index="2.0"
              title="oauth grants"
              hint="apps with account access"
              action={
                <form action={revokeAllOAuthGrantsAction}>
                  <button className="text-meta uppercase tracking-wider text-secondary hover:text-danger transition-colors">
                    revoke all
                  </button>
                </form>
              }
            >
              {dashboard.apps.length === 0 ? (
                <Empty>no connected apps</Empty>
              ) : (
                dashboard.apps.map(app => (
                  <Row key={app.appSlug}>
                    <RowLabel>{app.appName}</RowLabel>
                    <RowValue>{app.scopes.join(", ")}</RowValue>
                    <span className="text-meta text-muted">
                      {shortDate(app.createdAt)}
                    </span>
                  </Row>
                ))
              )}
            </Section>
          </div>

          <div data-mount-row>
            <Section
              index="3.0"
              title="telegram 2fa"
              hint="linked recovery channel"
            >
              <Row>
                <RowLabel>status</RowLabel>
                <RowValue>
                  {hasTelegram ? (
                    <span className="flex items-baseline gap-2">
                      <Glyph kind="ok" />
                      <span>
                        enabled {shortDate(current.user.telegramVerifiedAt)}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-baseline gap-2">
                      <Glyph kind="warn" />
                      <span className="text-accent">not linked</span>
                    </span>
                  )}
                </RowValue>
                <Link
                  href="/relink"
                  className="text-meta uppercase tracking-wider text-secondary hover:text-accent transition-colors"
                >
                  relink
                </Link>
              </Row>
            </Section>
          </div>

          <div data-mount-row>
            <Section
              index="4.0"
              title="passkeys"
              hint="passwordless credentials"
            >
              <PasskeyManager
                passkeys={passkeys.map(item => ({
                  id: item.credentialId,
                  name: item.name || "Unknown Device",
                  lastUsed: item.lastUsedAt,
                }))}
              />
            </Section>
          </div>

          <div data-mount-row>
            <Section
              index="5.0"
              title="recent activity"
              hint="security events"
            >
              {dashboard.events.length === 0 ? (
                <Empty>no recent events</Empty>
              ) : (
                dashboard.events.map((event, index) => (
                  <Row key={`${event.created_at}-${index}`}>
                    <RowLabel>
                      <span className="tabular-nums normal-case tracking-normal text-faint">
                        {shortDate(event.created_at)}
                      </span>
                    </RowLabel>
                    <RowValue>{event.event_type}</RowValue>
                    <span className="text-meta uppercase tracking-wider text-muted">
                      {event.result}
                    </span>
                  </Row>
                ))
              )}
            </Section>
          </div>
        </main>
      </div>
    </div>
  );
}

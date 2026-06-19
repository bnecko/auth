import Link from "next/link";
import { redirect } from "next/navigation";
import { PasskeyManager } from "@/components/PasskeyManager";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { Sidebar } from "@/components/Sidebar";
import { Tag } from "@/components/Tag";
import { TopNav } from "@/components/TopNav";
import { findWebauthnCredentialsByUser } from "@/lib/server/repositories/webauthn";
import { getCurrentSession } from "@/lib/server/session";
import { getDashboard } from "@/lib/server/services/dashboard";
import {
  changePasswordAction,
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
        <TopNav trail="Security center" />
        <main
          className="max-w-[960px] mx-auto px-6 py-10"
          data-mount-stagger
        >
          <header className="mb-10" data-mount-row>
            <div className="flex items-baseline gap-2 mb-2">
              <Tag tone={hasTelegram ? "success" : "warning"}>
                {hasTelegram ? "2FA enabled" : "2FA missing"}
              </Tag>
            </div>
            <h1 className="text-[32px] tracking-tight text-fg leading-none mb-3">
              Security center
            </h1>
            <p className="text-[14px] text-muted max-w-prose">
              Sessions, OAuth grants, passkeys, Telegram 2FA, and recent
              security activity.
            </p>
          </header>

          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 bg-card border border-rule rounded-lg"
            data-mount-row
          >
            {[
              { label: "Sessions", value: dashboard.sessions.length },
              { label: "OAuth grants", value: dashboard.apps.length },
              { label: "Passkeys", value: passkeys.length },
              { label: "Events", value: dashboard.events.length },
            ].map((item, i) => (
              <div
                key={item.label}
                className={`px-4 py-4 ${
                  i > 0 ? "border-l border-rule" : ""
                }`}
              >
                <div className="text-[12px] text-muted mb-1">
                  {item.label}
                </div>
                <div className="text-[34px] text-accent-strong tabular-nums leading-none">
                  {String(item.value).padStart(2, "0")}
                </div>
              </div>
            ))}
          </div>

          <div data-mount-row>
            <Section
              index="1.0"
              title="Sessions"
              hint="Signed-in browsers"
              action={
                <form action={revokeOtherSessionsAction}>
                  <button className="text-[13px] text-secondary hover:text-danger transition-colors">
                    Revoke others
                  </button>
                </form>
              }
            >
              {dashboard.sessions.map(session => (
                <Row key={session.id}>
                  <RowLabel>{session.userAgent || "Unknown browser"}</RowLabel>
                  <RowValue>
                    <span className="text-secondary">
                      {session.ip || "Unknown IP"}
                    </span>
                    <span className="text-faint">·</span>
                    <span className="text-muted">
                      {shortDate(session.lastSeenAt)}
                    </span>
                    {session.id === current.session.id && (
                      <Tag tone="success">This device</Tag>
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
              title="OAuth grants"
              hint="Apps with account access"
              action={
                <form action={revokeAllOAuthGrantsAction}>
                  <button className="text-[13px] text-secondary hover:text-danger transition-colors">
                    Revoke all
                  </button>
                </form>
              }
            >
              {dashboard.apps.length === 0 ? (
                <Empty>No connected apps</Empty>
              ) : (
                dashboard.apps.map(app => (
                  <Row key={app.appSlug}>
                    <RowLabel>{app.appName}</RowLabel>
                    <RowValue>{app.scopes.join(", ")}</RowValue>
                    <span className="text-[13px] text-muted">
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
              title="Telegram 2FA"
              hint="Linked recovery channel"
            >
              <Row>
                <RowLabel>Status</RowLabel>
                <RowValue>
                  {hasTelegram ? (
                    <span className="flex items-baseline gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-success" />
                      <span>
                        Enabled {shortDate(current.user.telegramVerifiedAt)}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-baseline gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-warning" />
                      <span className="text-accent-strong">Not linked</span>
                    </span>
                  )}
                </RowValue>
                <Link
                  href="/relink"
                  className="text-[13px] text-secondary hover:text-accent-strong transition-colors"
                >
                  Relink
                </Link>
              </Row>
            </Section>
          </div>

          <div data-mount-row>
            <Section
              index="4.0"
              title="Passkeys"
              hint="Passwordless credentials"
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
              title="Password"
              hint="Rotate your account password"
            >
              <ChangePasswordForm action={changePasswordAction} />
            </Section>
          </div>

          <div data-mount-row>
            <Section
              index="6.0"
              title="Recent activity"
              hint="Security events"
            >
              {dashboard.events.length === 0 ? (
                <Empty>No recent events</Empty>
              ) : (
                dashboard.events.map((event, index) => (
                  <Row key={`${event.created_at}-${index}`}>
                    <RowLabel>
                      <span className="tabular-nums text-faint">
                        {shortDate(event.created_at)}
                      </span>
                    </RowLabel>
                    <RowValue>{event.event_type}</RowValue>
                    <span className="text-[13px] text-muted">
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

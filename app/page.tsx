import { redirect } from "next/navigation";
import { BearerSection } from "@/components/BearerSection";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { getDashboard } from "@/lib/server/services/dashboard";
import {
  revokeSessionAction,
  revokeAppAction,
  cancelSubscriptionAction,
} from "./dashboard-actions";
import { findWebauthnCredentialsByUser } from "@/lib/server/repositories/webauthn";
import { PasskeyManager } from "@/components/PasskeyManager";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  return status === "active"
    ? "success"
    : status === "banned"
      ? "danger"
      : "warning";
}

function shortDate(value: string | null) {
  if (!value) return "never";
  return value.slice(0, 10);
}

export default async function DashboardPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login");
  }

  const dashboard = await getDashboard(current.user);
  const account = dashboard.account;
  const webauthnCredentials = await findWebauthnCredentialsByUser(
    current.user.id,
  );

  const stats = [
    { label: "subscriptions", value: dashboard.stats.subscriptions, hint: "active" },
    { label: "apps", value: dashboard.stats.apps, hint: "connected" },
    { label: "sessions", value: dashboard.stats.sessions, hint: "active" },
    { label: "activations", value: dashboard.stats.activations, hint: "recent" },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: account.firstName, username: account.username }} />
      <div className="flex-1 min-w-0">
        <TopNav trail="account" isAdmin={current.user.role === "admin"} />
        <main
          className="max-w-[960px] mx-auto px-6 py-10"
          data-mount-stagger
        >
          <header data-mount-row className="mb-10">
            <div className="flex items-baseline gap-3 flex-wrap mb-3">
              <h1 className="text-[32px] tracking-tight text-fg leading-none">
                {account.firstName}
              </h1>
              <span className="text-faint text-[24px] leading-none">/</span>
              <span className="text-[24px] text-secondary leading-none">
                @{account.username}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Tag tone={statusTone(account.status)}>{account.status}</Tag>
              <Tag tone={account.telegramVerifiedAt ? "success" : "warning"}>
                {account.telegramVerifiedAt ? "Telegram verified" : "Telegram unverified"}
              </Tag>
            </div>
          </header>

          <div
            data-mount-row
            className="bg-card border border-rule rounded-lg grid grid-cols-2 md:grid-cols-4 mb-12 shadow-card"
          >
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={`px-5 py-5 ${i > 0 ? "md:border-l border-rule" : ""}`}
              >
                <div className="text-[12px] text-muted mb-1">
                  {stat.label.charAt(0).toUpperCase() + stat.label.slice(1)}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[34px] text-accent tabular-nums leading-none">
                    {String(stat.value).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] text-faint">{stat.hint}</span>
                </div>
              </div>
            ))}
          </div>

          <div id="profile" />
          <div data-mount-row>
            <Section title="Profile" hint="Account fields" index="1.0">
              <Row>
                <RowLabel>First name</RowLabel>
                <RowValue>{account.firstName}</RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>Username</RowLabel>
                <RowValue>@{account.username}</RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>Bio</RowLabel>
                <RowValue>{account.bio || "Not set"}</RowValue>
                <span className="text-[12px] text-ok">
                  Public
                </span>
              </Row>
              <Row>
                <RowLabel>Email</RowLabel>
                <RowValue privateField>{account.email}</RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>Date of birth</RowLabel>
                <RowValue privateField>{account.dob || "Not set"}</RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>Telegram</RowLabel>
                <RowValue>
                  {account.telegramUsername
                    ? `@${account.telegramUsername}`
                    : account.telegramId || "Not linked"}
                </RowValue>
                <a
                  href="/relink"
                  className="text-[13px] text-secondary hover:text-accent-strong transition-colors"
                >
                  Relink
                </a>
              </Row>
            </Section>
          </div>

          <div id="subscriptions" />
          <div data-mount-row>
            <Section
              title="Subscriptions"
              hint="Products you pay for"
              index="2.0"
            >
              {dashboard.subscriptions.length === 0 ? (
                <Empty>No active subscriptions</Empty>
              ) : (
                dashboard.subscriptions.map(subscription => (
                  <Row
                    key={`${subscription.product}-${subscription.expiresAt || "open"}`}
                  >
                    <RowLabel>{subscription.product}</RowLabel>
                    <RowValue>
                      <Tag
                        tone={
                          subscription.status === "revoked" ? "danger" : "success"
                        }
                      >
                        {subscription.status}
                      </Tag>
                      <span className="text-muted">·</span>
                      <span className="text-secondary">
                        Expires {shortDate(subscription.expiresAt)}
                      </span>
                    </RowValue>
                    <form action={cancelSubscriptionAction}>
                      <input
                        type="hidden"
                        name="product"
                        value={subscription.product}
                      />
                      <button
                        type="submit"
                        className="text-[13px] text-secondary hover:text-danger transition-colors"
                      >
                        Cancel
                      </button>
                    </form>
                  </Row>
                ))
              )}
            </Section>
          </div>

          <div id="apps" />
          <div data-mount-row>
            <Section
              title="Connected apps"
              hint="External apps with access"
              index="3.0"
            >
              {dashboard.apps.length === 0 ? (
                <Empty>No connected apps</Empty>
              ) : (
                dashboard.apps.map(app => (
                  <Row key={app.appSlug}>
                    <RowLabel>{app.appName}</RowLabel>
                    <RowValue>
                      <span className="text-secondary truncate">
                        {app.scopes.join(", ")}
                      </span>
                      <span className="text-muted">·</span>
                      <span className="text-muted">
                        Since {shortDate(app.createdAt)}
                      </span>
                    </RowValue>
                    <form action={revokeAppAction}>
                      <input
                        type="hidden"
                        name="appSlug"
                        value={app.appSlug}
                      />
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
          </div>

          <div id="bearers" />
          <div data-mount-row>
            <BearerSection bearers={dashboard.bearers} />
          </div>

          <div id="sessions" />
          <div data-mount-row>
            <Section
              title="Sessions"
              hint="Devices currently signed in"
              index="4.0"
            >
              {dashboard.sessions.map(session => (
                <Row key={session.id}>
                  <RowLabel>{session.userAgent || "Unknown browser"}</RowLabel>
                  <RowValue>
                    <span className="text-secondary truncate">
                      {session.ip || "Unknown IP"}
                    </span>
                    <span className="text-muted">·</span>
                    <span className="text-muted">
                      {shortDate(session.lastSeenAt)}
                    </span>
                    {session.id === current.session.id && (
                      <Tag tone="success">This device</Tag>
                    )}
                  </RowValue>
                  <form action={revokeSessionAction}>
                    <input
                      type="hidden"
                      name="sessionId"
                      value={session.id}
                    />
                    <button
                      type="submit"
                      className="text-[13px] text-secondary hover:text-danger transition-colors disabled:text-faint disabled:hover:text-faint disabled:cursor-not-allowed"
                      disabled={session.id === current.session.id}
                    >
                      Revoke
                    </button>
                  </form>
                </Row>
              ))}
            </Section>
          </div>

          <div id="security" />
          <div data-mount-row>
            <Section title="Security" hint="Authentication" index="5.0">
              <Row>
                <RowLabel>Password</RowLabel>
                <RowValue>Enabled</RowValue>
                <button className="text-[13px] text-secondary hover:text-accent-strong transition-colors">
                  Change
                </button>
              </Row>
              <Row>
                <RowLabel>Telegram 2FA</RowLabel>
                <RowValue>
                  {account.telegramVerifiedAt
                    ? `Enabled ${shortDate(account.telegramVerifiedAt)}`
                    : "Not linked"}
                </RowValue>
                <a
                  href="/relink"
                  className="text-[13px] text-secondary hover:text-accent-strong transition-colors"
                >
                  Relink
                </a>
              </Row>
            </Section>
          </div>

          <div id="passkeys" />
          <div data-mount-row>
            <Section
              title="Passkeys"
              hint="Passwordless sign in"
              index="5.1"
            >
              <PasskeyManager
                passkeys={webauthnCredentials.map(c => ({
                  id: c.credentialId,
                  name: c.name || "Unknown Device",
                  lastUsed: c.lastUsedAt,
                }))}
              />
            </Section>
          </div>

          <div id="events" />
          <div data-mount-row>
            <Section
              title="Recent events"
              hint="Last security activity"
              index="6.0"
            >
              {dashboard.events.length === 0 ? (
                <Empty>No recent events</Empty>
              ) : (
                <ul className="text-[12.5px]">
                  {dashboard.events.map((event, index) => (
                    <li
                      key={`${event.created_at}-${index}`}
                      className="grid grid-cols-[180px_1fr_auto] gap-4 px-1 py-2.5 items-baseline border-t border-rule first:border-t-0"
                    >
                      <span className="text-muted tabular-nums">
                        {event.created_at.slice(0, 16).replace("T", " ")}
                      </span>
                      <span className="text-fg">{event.event_type}</span>
                      <span className="text-[12px] text-muted truncate max-w-[280px]">
                        {event.ip || event.result}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <footer className="mt-12 pt-5 border-t border-rule text-[13px] text-faint flex items-center justify-between">
            <span>bottleneck</span>
            <span className="tabular-nums">auth.bneck.com</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

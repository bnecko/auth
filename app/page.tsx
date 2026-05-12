import { redirect } from "next/navigation";
import { BearerSection } from "@/components/BearerSection";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
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
          {/* HEADER */}
          <header data-mount-row className="mb-10">
            <div className="flex items-baseline gap-2 mb-2 text-meta text-muted">
              <span className="text-accent">$</span>
              <span className="tracking-wider">bottleneck/console</span>
              <span className="text-faint">/ {account.username}</span>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap mb-3">
              <h1 className="text-[32px] tracking-tightest text-fg leading-none">
                {account.firstName}
              </h1>
              <span className="text-faint text-[24px] leading-none">/</span>
              <span className="text-[24px] text-secondary tracking-tightest leading-none">
                @{account.username}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Tag tone={statusTone(account.status)}>{account.status}</Tag>
              <Tag tone={account.telegramVerifiedAt ? "success" : "warning"}>
                {account.telegramVerifiedAt ? "tg verified" : "tg unverified"}
              </Tag>
              <span className="text-meta text-faint">
                · console session {current.session.id}
              </span>
            </div>
          </header>

          {/* STATS — rule-divided columns, no bordered boxes */}
          <div
            data-mount-row
            className="rule-x border-y border-rule grid grid-cols-2 md:grid-cols-4 mb-12"
          >
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={`px-5 py-5 ${i > 0 ? "md:border-l border-rule" : ""}`}
              >
                <div className="text-micro uppercase tracking-wider text-muted mb-1">
                  {stat.label}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[34px] text-accent tabular-nums tracking-tightest leading-none">
                    {String(stat.value).padStart(2, "0")}
                  </span>
                  <span className="text-meta text-faint">{stat.hint}</span>
                </div>
              </div>
            ))}
          </div>

          <div id="profile" />
          <div data-mount-row>
            <Section title="profile" hint="account fields" index="1.0">
              <Row>
                <RowLabel>first name</RowLabel>
                <RowValue>{account.firstName}</RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>username</RowLabel>
                <RowValue>@{account.username}</RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>bio</RowLabel>
                <RowValue>{account.bio || "not set"}</RowValue>
                <span className="text-micro uppercase tracking-wider text-ok">
                  public
                </span>
              </Row>
              <Row>
                <RowLabel>email</RowLabel>
                <RowValue privateField>{account.email}</RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>date of birth</RowLabel>
                <RowValue privateField>{account.dob || "not set"}</RowValue>
                <span />
              </Row>
              <Row>
                <RowLabel>telegram</RowLabel>
                <RowValue>
                  {account.telegramUsername
                    ? `@${account.telegramUsername}`
                    : account.telegramId || "not linked"}
                </RowValue>
                <a
                  href="/relink"
                  className="text-meta uppercase tracking-wider text-secondary hover:text-accent transition-colors"
                >
                  relink
                </a>
              </Row>
            </Section>
          </div>

          <div id="subscriptions" />
          <div data-mount-row>
            <Section
              title="subscriptions"
              hint="products you pay for"
              index="2.0"
            >
              {dashboard.subscriptions.length === 0 ? (
                <Empty>no active subscriptions</Empty>
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
                      <Glyph kind="dot" />
                      <span className="text-secondary">
                        expires {shortDate(subscription.expiresAt)}
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
                        className="text-meta uppercase tracking-wider text-secondary hover:text-danger transition-colors"
                      >
                        cancel
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
              title="connected apps"
              hint="external apps with access"
              index="3.0"
            >
              {dashboard.apps.length === 0 ? (
                <Empty>no connected apps</Empty>
              ) : (
                dashboard.apps.map(app => (
                  <Row key={app.appSlug}>
                    <RowLabel>{app.appName}</RowLabel>
                    <RowValue>
                      <span className="text-secondary truncate">
                        {app.scopes.join(", ")}
                      </span>
                      <Glyph kind="dot" />
                      <span className="text-muted">
                        since {shortDate(app.createdAt)}
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
                        className="text-meta uppercase tracking-wider text-secondary hover:text-danger transition-colors"
                      >
                        revoke
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
              title="sessions"
              hint="devices currently signed in"
              index="4.0"
            >
              {dashboard.sessions.map(session => (
                <Row key={session.id}>
                  <RowLabel>{session.userAgent || "unknown browser"}</RowLabel>
                  <RowValue>
                    <span className="text-secondary truncate">
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
                  <form action={revokeSessionAction}>
                    <input
                      type="hidden"
                      name="sessionId"
                      value={session.id}
                    />
                    <button
                      type="submit"
                      className="text-meta uppercase tracking-wider text-secondary hover:text-danger transition-colors disabled:text-faint disabled:hover:text-faint disabled:cursor-not-allowed"
                      disabled={session.id === current.session.id}
                    >
                      revoke
                    </button>
                  </form>
                </Row>
              ))}
            </Section>
          </div>

          <div id="security" />
          <div data-mount-row>
            <Section title="security" hint="authentication" index="5.0">
              <Row>
                <RowLabel>password</RowLabel>
                <RowValue>enabled</RowValue>
                <button className="text-meta uppercase tracking-wider text-secondary hover:text-accent transition-colors">
                  change
                </button>
              </Row>
              <Row>
                <RowLabel>telegram 2fa</RowLabel>
                <RowValue>
                  {account.telegramVerifiedAt
                    ? `enabled ${shortDate(account.telegramVerifiedAt)}`
                    : "not linked"}
                </RowValue>
                <a
                  href="/relink"
                  className="text-meta uppercase tracking-wider text-secondary hover:text-accent transition-colors"
                >
                  relink
                </a>
              </Row>
            </Section>
          </div>

          <div id="passkeys" />
          <div data-mount-row>
            <Section
              title="passkeys"
              hint="passwordless sign in"
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
              title="recent events"
              hint="last security activity"
              index="6.0"
            >
              {dashboard.events.length === 0 ? (
                <Empty>no recent events</Empty>
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
                      <span className="text-meta text-muted truncate max-w-[280px]">
                        {event.ip || event.result}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <footer className="mt-12 pt-5 border-t border-rule text-meta text-faint flex items-center justify-between">
            <span>bnck-auth · console</span>
            <span className="tabular-nums">eof.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

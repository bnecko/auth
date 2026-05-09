import { redirect } from "next/navigation";
import { BearerSection } from "@/components/BearerSection";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { getDashboard } from "@/lib/server/services/dashboard";
import { revokeSessionAction, revokeAppAction, cancelSubscriptionAction } from "./dashboard-actions";
import { findWebauthnCredentialsByUser } from "@/lib/server/repositories/webauthn";
import { PasskeyManager } from "@/components/PasskeyManager";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  return status === "active" ? "success" : status === "banned" ? "danger" : "warning";
}

function shortDate(value: string | null) {
  if (!value) {
    return "never";
  }

  return value.slice(0, 10);
}

export default async function DashboardPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login");
  }

  const dashboard = await getDashboard(current.user);
  const account = dashboard.account;
  const webauthnCredentials = await findWebauthnCredentialsByUser(current.user.id);

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: account.firstName, username: account.username }} />
      <div className="flex-1 min-w-0">
        <TopNav trail="account" />
        <main className="max-w-[960px] mx-auto px-6 py-10">
          <header className="mb-9">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-micro uppercase text-faint">account</span>
              <Tag tone={statusTone(account.status)}>
                {account.status}
              </Tag>
              <Tag tone={account.telegramVerifiedAt ? "success" : "warning"}>
                {account.telegramVerifiedAt ? "tg verified" : "tg unverified"}
              </Tag>
            </div>
            <h1 className="text-[28px] tracking-tightest text-fg leading-none">
              {account.firstName}
              <span className="text-faint"> / </span>
              <span className="text-secondary">@{account.username}</span>
            </h1>
            <p className="mt-3 text-meta text-muted max-w-prose">
              account, sessions, connected apps, and recent security activity.
            </p>
          </header>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border rounded-sm overflow-hidden mb-10">
            {[
              { label: "subscriptions", value: dashboard.stats.subscriptions, hint: "active" },
              { label: "apps", value: dashboard.stats.apps, hint: "connected" },
              { label: "sessions", value: dashboard.stats.sessions, hint: "active" },
              { label: "activations", value: dashboard.stats.activations, hint: "recent" },
            ].map(stat => (
              <div
                key={stat.label}
                className="bg-surface px-4 py-3 hover:bg-hover transition-colors"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-micro uppercase text-faint">
                    {stat.label}
                  </span>
                  <span className="text-meta text-muted">{stat.hint}</span>
                </div>
                <div className="text-[24px] text-fg tabular-nums tracking-tightest mt-1">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          <div id="profile" />
          <Section title="profile" hint="// account fields">
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
              <span className="text-micro uppercase text-success">public</span>
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
                href="/api/telegram/callback"
                className="text-meta text-secondary hover:text-fg transition-colors"
              >
                relink
              </a>
            </Row>
          </Section>

          <div id="subscriptions" />
          <Section title="subscriptions" hint="// products you pay for">
            {dashboard.subscriptions.length === 0 ? (
              <Empty>no active subscriptions</Empty>
            ) : (
              dashboard.subscriptions.map(subscription => (
                <Row key={`${subscription.product}-${subscription.expiresAt || "open"}`}>
                  <RowLabel>{subscription.product}</RowLabel>
                  <RowValue>
                    <Tag tone={subscription.status === "revoked" ? "danger" : "success"}>
                      {subscription.status}
                    </Tag>
                    <span className="text-faint">/</span>
                    <span className="text-secondary">
                      expires {shortDate(subscription.expiresAt)}
                    </span>
                  </RowValue>
                  <form action={cancelSubscriptionAction}>
                    <input type="hidden" name="product" value={subscription.product} />
                    <button type="submit" className="text-meta text-secondary hover:text-danger transition-colors">
                      cancel
                    </button>
                  </form>
                </Row>
              ))
            )}
          </Section>

          <div id="apps" />
          <Section title="connected apps" hint="// external apps with access">
            {dashboard.apps.length === 0 ? (
              <Empty>no connected apps</Empty>
            ) : (
              dashboard.apps.map(app => (
                <Row key={app.appSlug}>
                  <RowLabel>{app.appName}</RowLabel>
                  <RowValue>
                    <span className="text-secondary">
                      {app.scopes.join(", ")}
                    </span>
                    <span className="text-faint">/</span>
                    <span className="text-muted">since {shortDate(app.createdAt)}</span>
                  </RowValue>
                  <form action={revokeAppAction}>
                    <input type="hidden" name="appSlug" value={app.appSlug} />
                    <button type="submit" className="text-meta text-secondary hover:text-danger transition-colors">
                      revoke
                    </button>
                  </form>
                </Row>
              ))
            )}
          </Section>

          <div id="bearers" />
          <BearerSection bearers={dashboard.bearers} />

          <div id="sessions" />
          <Section title="sessions" hint="// devices currently signed in">
            {dashboard.sessions.map(session => (
              <Row key={session.id}>
                <RowLabel>{session.userAgent || "unknown browser"}</RowLabel>
                <RowValue>
                  <span className="text-secondary">{session.ip || "unknown ip"}</span>
                  <span className="text-faint">/</span>
                  <span className="text-muted">{shortDate(session.lastSeenAt)}</span>
                  {session.id === current.session.id && (
                    <Tag tone="success">this device</Tag>
                  )}
                </RowValue>
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button
                    type="submit"
                    className="text-meta text-secondary hover:text-danger transition-colors disabled:text-faint disabled:hover:text-faint disabled:cursor-not-allowed"
                    disabled={session.id === current.session.id}
                  >
                    revoke
                  </button>
                </form>
              </Row>
            ))}
          </Section>

          <div id="security" />
          <Section title="security" hint="// authentication">
            <Row>
              <RowLabel>password</RowLabel>
              <RowValue>enabled</RowValue>
              <button className="text-meta text-secondary hover:text-fg transition-colors">
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
                href="/api/telegram/callback"
                className="text-meta text-secondary hover:text-fg transition-colors"
              >
                relink
              </a>
            </Row>
          </Section>

          <div id="passkeys" />
          <Section title="passkeys" hint="// passwordless sign in">
            <PasskeyManager
              passkeys={webauthnCredentials.map(c => ({
                id: c.credentialId,
                name: c.name || "Unknown Device",
                lastUsed: c.lastUsedAt,
              }))}
            />
          </Section>

          <div id="events" />
          <Section title="recent events" hint="// last security activity">
            {dashboard.events.length === 0 ? (
              <Empty>no recent events</Empty>
            ) : (
              <ul className="text-[12.5px] divide-y divide-border">
                {dashboard.events.map((event, index) => (
                  <li
                    key={`${event.created_at}-${index}`}
                    className="grid grid-cols-[180px_1fr_auto] gap-4 px-4 py-2.5 items-center hover:bg-hover/50 transition-colors"
                  >
                    <span className="text-muted tabular-nums">
                      {event.created_at.slice(0, 16).replace("T", " ")}
                    </span>
                    <span className="text-fg">{event.event_type}</span>
                    <span className="text-meta text-muted">
                      {event.ip || event.result}
                    </span>
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

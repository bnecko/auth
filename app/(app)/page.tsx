import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Tag } from "@/components/Tag";
import { Button } from "@/components/Button";
import { getCurrentSession } from "@/lib/server/session";
import { getDashboard } from "@/lib/server/services/dashboard";
import { findWebauthnCredentialsByUser } from "@/lib/server/repositories/webauthn";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  return status === "active" ? "success" : status === "banned" ? "danger" : "warning";
}

function Card({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-elevated ring-1 ring-rule shadow-xs overflow-hidden flex flex-col">
      <header className="h-11 px-3.5 flex items-center justify-between">
        <h3 className="text-[14px] font-medium text-fg">{title}</h3>
        {href && (
          <Link href={href}>
            <Button variant="ghost" size="sm">
              View <ArrowRight size={12} />
            </Button>
          </Link>
        )}
      </header>
      <div className="m-1 mt-0 rounded-lg ring-1 ring-rule bg-card overflow-hidden flex-1">{children}</div>
    </div>
  );
}

function CardRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-rule first:border-t-0 text-[13px]">
      <span className="text-muted shrink-0">{label}</span>
      <span className="text-fg text-right truncate">{value}</span>
    </div>
  );
}

function NextStep({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 border-t border-rule first:border-t-0 text-[13px] text-fg hover:bg-hover transition-colors group"
    >
      <span>{label}</span>
      <ArrowRight size={14} className="text-faint group-hover:text-accent-strong transition-colors" />
    </Link>
  );
}

export default async function AccountHomePage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  const u = current.user;
  const [dashboard, passkeys] = await Promise.all([
    getDashboard(u),
    findWebauthnCredentialsByUser(u.id),
  ]);
  const { stats, events, apps, sessions } = dashboard;
  const hasTelegram = !!u.telegramVerifiedAt;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-[28px] tracking-tight text-fg leading-none mb-3">Account home</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[14px] text-secondary">
            Signed in as {u.firstName} (@{u.username})
          </span>
          <Tag tone={statusTone(u.status)}>{u.status}</Tag>
          <Tag tone={hasTelegram ? "success" : "warning"}>
            {hasTelegram ? "Telegram verified" : "Telegram unverified"}
          </Tag>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card title="Account" href="/settings/profile">
          <CardRow label="Status" value={<Tag tone={statusTone(u.status)}>{u.status}</Tag>} />
          <CardRow label="Telegram" value={hasTelegram ? "Verified" : "Not linked"} />
          <CardRow label="Username" value={`@${u.username}`} />
        </Card>
        <Card title="Security" href="/settings/security">
          <CardRow label="Active sessions" value={stats.sessions} />
          <CardRow label="Passkeys" value={passkeys.length} />
          <CardRow label="Password" value="Enabled" />
        </Card>
        <Card title="Access" href="/apps">
          <CardRow label="Connected apps" value={stats.apps} />
          <CardRow label="Subscriptions" value={stats.subscriptions} />
          <CardRow label="API bearers" value={dashboard.bearers.length} />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Recent activity" href="/settings/activity">
          {events.length === 0 ? (
            <div className="px-4 py-8 text-[13px] text-muted text-center">No recent events</div>
          ) : (
            events.slice(0, 6).map((event, i) => (
              <div
                key={`${event.created_at}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-rule first:border-t-0 text-[13px]"
              >
                <span className="text-fg truncate">{event.event_type}</span>
                <span className="text-[12px] text-muted tabular-nums shrink-0">
                  {event.created_at.slice(0, 10)}
                </span>
              </div>
            ))
          )}
        </Card>

        <Card title="Next steps">
          {!hasTelegram && <NextStep href="/relink" label="Enable Telegram 2FA" />}
          {passkeys.length === 0 && <NextStep href="/settings/security" label="Add a passkey for passwordless sign in" />}
          {apps.length > 0 && <NextStep href="/apps" label="Review connected apps" />}
          {sessions.length > 1 && <NextStep href="/settings/sessions" label="Check your active sessions" />}
          <NextStep href="/request-bearer" label="Request an API bearer token" />
        </Card>
      </div>
    </>
  );
}

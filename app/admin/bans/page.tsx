import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
import { query } from "@/lib/server/db";
import { getCurrentSession } from "@/lib/server/session";
import { redirect } from "next/navigation";
import { revokeBanAction } from "./actions";

export const dynamic = "force-dynamic";

async function getBans() {
  return query<{
    id: string;
    kind: string;
    reason: string | null;
    username: string | null;
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
  }>(
    `select b.id, b.kind, b.reason, u.username, b.created_at::text,
            b.expires_at::text, b.revoked_at::text
       from bans b
       left join users u on u.id = b.user_id
      order by b.created_at desc
      limit 200`,
  );
}

export default async function AdminBansPage() {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") redirect("/");

  const bans = await getBans();
  const active = bans.filter(b => !b.revoked_at);
  const revoked = bans.filter(b => b.revoked_at);

  return (
    <main
      className="flex-1 max-w-[960px] w-full mx-auto px-6 py-10"
      data-mount-stagger
    >
      <header className="mb-10" data-mount-row>
        <div className="flex items-baseline gap-2 mb-2 text-meta">
          <span className="text-danger">$</span>
          <span className="uppercase tracking-wider text-muted">
            admin.bans
          </span>
          <span className="text-faint">·</span>
          <span className="text-meta text-faint tabular-nums">
            {String(active.length).padStart(2, "0")} active
          </span>
        </div>
        <h1 className="text-[32px] tracking-tightest text-fg leading-none">
          bans
        </h1>
      </header>

      <div data-mount-row>
        <Section index="1.0" title="active bans" hint="enforced now">
          {active.length === 0 ? (
            <Empty>no active bans</Empty>
          ) : (
            active.map(ban => (
              <div
                key={ban.id}
                className="border-t border-rule first:border-t-0 py-3 px-1 flex items-baseline gap-4 text-meta"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Tag tone="danger">{ban.kind}</Tag>
                    {ban.username && (
                      <span className="text-fg">@{ban.username}</span>
                    )}
                  </div>
                  {ban.reason && (
                    <div className="text-muted mt-1">{ban.reason}</div>
                  )}
                  <div className="text-faint mt-1 flex items-baseline gap-2">
                    <span className="tabular-nums">
                      {ban.created_at?.slice(0, 10)}
                    </span>
                    {ban.expires_at && (
                      <>
                        <Glyph kind="dot" />
                        <span>expires {ban.expires_at.slice(0, 10)}</span>
                      </>
                    )}
                  </div>
                </div>
                <form action={revokeBanAction}>
                  <input type="hidden" name="banId" value={ban.id} />
                  <button
                    type="submit"
                    className="text-meta uppercase tracking-wider text-secondary hover:text-accent transition-colors"
                  >
                    revoke
                  </button>
                </form>
              </div>
            ))
          )}
        </Section>
      </div>

      {revoked.length > 0 && (
        <div data-mount-row>
          <Section index="2.0" title="revoked bans" hint="historical">
            {revoked.map(ban => (
              <div
                key={ban.id}
                className="border-t border-rule first:border-t-0 py-3 px-1 flex items-baseline gap-4 text-meta opacity-60"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Tag tone="neutral">{ban.kind}</Tag>
                    {ban.username && (
                      <span className="text-fg">@{ban.username}</span>
                    )}
                  </div>
                  {ban.reason && (
                    <div className="text-muted mt-1">{ban.reason}</div>
                  )}
                  <div className="text-faint mt-1 flex items-baseline gap-2 tabular-nums">
                    <span>{ban.created_at?.slice(0, 10)}</span>
                    <Glyph kind="dot" />
                    <span>revoked {ban.revoked_at?.slice(0, 10)}</span>
                  </div>
                </div>
              </div>
            ))}
          </Section>
        </div>
      )}
    </main>
  );
}

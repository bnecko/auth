import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
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
    <>
      <header className="mb-10" data-mount-row>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[13px] text-muted tabular-nums">
            {active.length} active
          </span>
        </div>
        <h1 className="text-[32px] tracking-tight text-fg leading-none">
          Bans
        </h1>
      </header>

      <div data-mount-row>
        <Section index="1.0" title="Active bans" hint="Enforced now">
          {active.length === 0 ? (
            <Empty>No active bans</Empty>
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
                  <div className="text-faint mt-1 flex items-baseline gap-2 tabular-nums">
                    <span>{ban.created_at?.slice(0, 10)}</span>
                    {ban.expires_at && (
                      <>
                        <span aria-hidden>·</span>
                        <span>expires {ban.expires_at.slice(0, 10)}</span>
                      </>
                    )}
                  </div>
                </div>
                <form action={revokeBanAction}>
                  <input type="hidden" name="banId" value={ban.id} />
                  <button
                    type="submit"
                    className="text-[13px] text-secondary hover:text-accent-strong transition-colors"
                  >
                    Revoke
                  </button>
                </form>
              </div>
            ))
          )}
        </Section>
      </div>

      {revoked.length > 0 && (
        <div data-mount-row>
          <Section index="2.0" title="Revoked bans" hint="Historical">
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
                    <span aria-hidden>·</span>
                    <span>revoked {ban.revoked_at?.slice(0, 10)}</span>
                  </div>
                </div>
              </div>
            ))}
          </Section>
        </div>
      )}
    </>
  );
}

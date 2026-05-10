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
    <main className="flex-1 max-w-[860px] w-full mx-auto px-6 py-10">
      <header className="mb-7">
        <h1 className="text-[26px] tracking-tightest text-fg leading-none">
          Bans
        </h1>
      </header>

      <Section title="active bans">
        {active.length === 0 ? (
          <Empty>no active bans</Empty>
        ) : (
          active.map(ban => (
            <div
              key={ban.id}
              className="border-b border-border last:border-0 px-4 py-3 flex items-center gap-4 text-[13px]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag tone="danger">{ban.kind}</Tag>
                  {ban.username && (
                    <span className="text-fg">@{ban.username}</span>
                  )}
                </div>
                {ban.reason && (
                  <div className="text-muted mt-0.5">{ban.reason}</div>
                )}
                <div className="text-faint text-meta mt-0.5">
                  {ban.created_at?.slice(0, 10)}
                  {ban.expires_at && ` expires ${ban.expires_at.slice(0, 10)}`}
                </div>
              </div>
              <form action={revokeBanAction}>
                <input type="hidden" name="banId" value={ban.id} />
                <button
                  type="submit"
                  className="text-meta uppercase tracking-wider text-secondary border border-border px-2.5 py-1 rounded-sm hover:bg-surface transition-colors"
                >
                  Revoke
                </button>
              </form>
            </div>
          ))
        )}
      </Section>

      {revoked.length > 0 && (
        <Section title="revoked bans">
          {revoked.map(ban => (
            <div
              key={ban.id}
              className="border-b border-border last:border-0 px-4 py-3 flex items-center gap-4 text-[13px] opacity-50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag tone="neutral">{ban.kind}</Tag>
                  {ban.username && (
                    <span className="text-fg">@{ban.username}</span>
                  )}
                </div>
                {ban.reason && (
                  <div className="text-muted mt-0.5">{ban.reason}</div>
                )}
                <div className="text-faint text-meta mt-0.5">
                  {ban.created_at?.slice(0, 10)} / revoked{" "}
                  {ban.revoked_at?.slice(0, 10)}
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}
    </main>
  );
}

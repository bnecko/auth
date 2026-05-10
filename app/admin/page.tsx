import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { query, queryOne } from "@/lib/server/db";
import { decideBearerAction } from "./actions";

export const dynamic = "force-dynamic";

async function getOverviewData() {
  const [stats, pendingRequests] = await Promise.all([
    Promise.all([
      queryOne<{ count: string }>("select count(*)::text from users where status != 'banned'"),
      queryOne<{ count: string }>("select count(*)::text from sessions where revoked_at is null and expires_at > now()"),
      queryOne<{ count: string }>("select count(*)::text from bearer_requests where status = 'pending'"),
      queryOne<{ count: string }>("select count(*)::text from activation_requests where status = 'pending'"),
    ]),
    query<{
      public_id: string;
      app_name: string;
      reason: string;
      created_at: string;
      user_id: string;
      email: string;
    }>(
      `select b.public_id, b.app_name, b.reason, b.created_at::text,
              u.id as user_id, u.email
         from bearer_requests b
         join users u on u.id = b.user_id
        where b.status = 'pending'
        order by b.created_at desc`,
    ),
  ]);

  return {
    stats: {
      activeUsers: Number(stats[0]?.count || 0),
      activeSessions: Number(stats[1]?.count || 0),
      pendingBearers: Number(stats[2]?.count || 0),
      pendingActivations: Number(stats[3]?.count || 0),
    },
    pendingRequests,
  };
}

export default async function AdminPage() {
  const data = await getOverviewData();

  return (
    <main className="flex-1 max-w-[860px] w-full mx-auto px-6 py-10">
      <header className="mb-9">
        <h1 className="text-[26px] tracking-tightest text-fg leading-none mb-2">
          Overview
        </h1>
        <p className="text-[13px] text-muted">
          System state at a glance.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-9">
        {[
          { label: "active users", value: data.stats.activeUsers },
          { label: "active sessions", value: data.stats.activeSessions },
          { label: "pending bearers", value: data.stats.pendingBearers },
          { label: "pending activations", value: data.stats.pendingActivations },
        ].map(stat => (
          <div
            key={stat.label}
            className="border border-border bg-surface rounded-sm px-4 py-3"
          >
            <div className="text-[22px] text-fg font-medium">{stat.value}</div>
            <div className="text-meta text-muted mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <Section title="pending bearer requests">
        {data.pendingRequests.length === 0 ? (
          <Empty>no pending requests</Empty>
        ) : (
          data.pendingRequests.map(req => (
            <div
              key={req.public_id}
              className="border-b border-border last:border-0 py-4 px-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[13px] text-fg font-medium">{req.app_name}</div>
                  <div className="text-meta text-muted mt-0.5">
                    {req.email} (id: {req.user_id})
                  </div>
                </div>
                <Tag tone="warning">pending</Tag>
              </div>
              <div className="text-[13px] text-secondary mb-4 bg-bg p-3 rounded-sm border border-border">
                {req.reason}
              </div>
              <div className="flex gap-2">
                <form action={decideBearerAction}>
                  <input type="hidden" name="requestId" value={req.public_id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button
                    type="submit"
                    className="text-micro uppercase tracking-wider bg-success text-bg px-3 py-1.5 rounded-sm hover:opacity-90 transition-opacity font-medium"
                  >
                    Approve
                  </button>
                </form>
                <form action={decideBearerAction}>
                  <input type="hidden" name="requestId" value={req.public_id} />
                  <input type="hidden" name="decision" value="reject" />
                  <button
                    type="submit"
                    className="text-micro uppercase tracking-wider bg-surface border border-border text-secondary px-3 py-1.5 rounded-sm hover:bg-elevated transition-colors font-medium"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </Section>
    </main>
  );
}

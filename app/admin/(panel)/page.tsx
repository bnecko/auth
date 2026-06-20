import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { ConfirmButton } from "@/components/ConfirmButton";
import { query, queryOne } from "@/lib/server/db";
import { decideBearerAction } from "./actions";

export const dynamic = "force-dynamic";

async function getOverviewData() {
  const [stats, pendingRequests] = await Promise.all([
    Promise.all([
      queryOne<{ count: string }>(
        "select count(*)::text from users where status != 'banned'",
      ),
      queryOne<{ count: string }>(
        "select count(*)::text from sessions where revoked_at is null and expires_at > now()",
      ),
      queryOne<{ count: string }>(
        "select count(*)::text from bearer_requests where status = 'pending'",
      ),
      queryOne<{ count: string }>(
        "select count(*)::text from activation_requests where status = 'pending'",
      ),
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
    <>
      <header className="mb-10" data-mount-row>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[12px] text-muted">Admin</span>
          <span className="text-[12px] text-faint">/</span>
          <span className="text-[12px] text-muted">Overview</span>
        </div>
        <h1 className="text-[32px] tracking-tight text-fg leading-none mb-3">
          Overview
        </h1>
        <p className="text-[14px] text-muted">System state at a glance</p>
      </header>

      <div
        className="grid grid-cols-2 sm:grid-cols-4 bg-card border border-rule rounded-lg mb-12"
        data-mount-row
      >
        {[
          { label: "Active users", value: data.stats.activeUsers },
          { label: "Sessions", value: data.stats.activeSessions },
          { label: "Pending bearers", value: data.stats.pendingBearers },
          { label: "Pending activations", value: data.stats.pendingActivations },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className={`px-4 py-5 ${i > 0 ? "border-l border-rule" : ""}`}
          >
            <div className="text-[12px] text-muted mb-1">{stat.label}</div>
            <div className="text-[34px] text-fg tabular-nums leading-none">
              {String(stat.value).padStart(2, "0")}
            </div>
          </div>
        ))}
      </div>

      <div data-mount-row>
        <Section
          index="1.0"
          title="Pending bearer requests"
          hint="Awaiting review"
        >
          {data.pendingRequests.length === 0 ? (
            <Empty>No pending requests</Empty>
          ) : (
            data.pendingRequests.map(req => (
              <div
                key={req.public_id}
                className="border-t border-rule first:border-t-0 py-4 px-1"
              >
                <div className="flex items-start justify-between mb-2 gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] text-fg">{req.app_name}</div>
                    <div className="text-meta text-muted mt-0.5">
                      {req.email}{" "}
                      <span className="text-faint">· id {req.user_id}</span>
                    </div>
                  </div>
                  <Tag tone="warning">Pending</Tag>
                </div>
                <div className="text-meta text-secondary mb-4 border-l border-rule pl-3 py-1 leading-relaxed whitespace-pre-wrap">
                  {req.reason}
                </div>
                <div className="flex items-center gap-2">
                  <ConfirmButton
                    action={decideBearerAction}
                    fields={{ requestId: req.public_id, decision: "approve" }}
                    label="Approve"
                    triggerVariant="primary"
                    tone="neutral"
                    title="Approve this bearer request?"
                    message="A new API key is issued to the requester and shown to them once."
                    confirmLabel="Approve"
                  />
                  <ConfirmButton
                    action={decideBearerAction}
                    fields={{ requestId: req.public_id, decision: "reject" }}
                    label="Deny"
                    triggerVariant="danger"
                    tone="danger"
                    title="Deny this bearer request?"
                    message="The request is rejected; no key is issued."
                    confirmLabel="Deny"
                  />
                </div>
              </div>
            ))
          )}
        </Section>
      </div>
    </>
  );
}

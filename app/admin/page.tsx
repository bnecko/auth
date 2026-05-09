import { TopNav } from "@/components/TopNav";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { query } from "@/lib/server/db";
import { decideBearerAction } from "./actions";

export const dynamic = "force-dynamic";

async function getAdminData() {
  const pendingRequests = await query<{
    public_id: string;
    app_name: string;
    reason: string;
    created_at: string;
    user_id: string;
    email: string;
  }>(
    `select b.public_id, b.app_name, b.reason, b.created_at::text, u.id as user_id, u.email
     from bearer_requests b
     join users u on u.id = b.user_id
     where b.status = 'pending'
     order by b.created_at desc`
  );

  return { pendingRequests };
}

export default async function AdminPage() {
  const data = await getAdminData();

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <TopNav trail="admin / dashboard" />
      <main className="flex-1 max-w-[800px] w-full mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-[28px] tracking-tightest text-fg leading-none mb-3">
            Admin Console
          </h1>
          <p className="text-meta text-muted max-w-prose">
            review bearer requests and manage system state.
          </p>
        </header>

        <Section title="pending bearer requests" hint="// awaiting approval">
          {data.pendingRequests.length === 0 ? (
            <Empty>no pending requests</Empty>
          ) : (
            data.pendingRequests.map(req => (
              <div key={req.public_id} className="border-b border-border last:border-0 py-4 px-4 hover:bg-hover/30 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-fg font-medium">{req.app_name}</div>
                    <div className="text-micro text-secondary mt-1">{req.email} (ID: {req.user_id})</div>
                  </div>
                  <Tag tone="warning">pending</Tag>
                </div>
                <div className="text-[13px] text-muted mb-4 bg-surface p-3 rounded-sm border border-border">
                  {req.reason}
                </div>
                <div className="flex gap-2">
                  <form action={decideBearerAction}>
                    <input type="hidden" name="requestId" value={req.public_id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button type="submit" className="text-micro uppercase tracking-wider bg-success text-bg px-3 py-1.5 rounded-sm hover:opacity-90 transition-opacity font-medium">
                      Approve
                    </button>
                  </form>
                  <form action={decideBearerAction}>
                    <input type="hidden" name="requestId" value={req.public_id} />
                    <input type="hidden" name="decision" value="reject" />
                    <button type="submit" className="text-micro uppercase tracking-wider bg-surface border border-border text-fg px-3 py-1.5 rounded-sm hover:bg-hover transition-colors font-medium">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </Section>
      </main>
    </div>
  );
}

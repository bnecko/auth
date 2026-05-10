import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { query } from "@/lib/server/db";
import { getCurrentSession } from "@/lib/server/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getActivationRequests() {
  return query<{
    public_id: string;
    status: string;
    app_name: string;
    requested_subject: string | null;
    approved_username: string | null;
    created_at: string;
    expires_at: string;
  }>(
    `select ar.public_id, ar.status, ea.name as app_name,
            ar.requested_subject, u.username as approved_username,
            ar.created_at::text, ar.expires_at::text
       from activation_requests ar
       join external_apps ea on ea.id = ar.external_app_id
       left join users u on u.id = ar.approved_user_id
      order by ar.created_at desc
      limit 200`,
  );
}

const statusTone: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  approved: "success",
  denied: "danger",
  expired: "neutral",
  cancelled: "neutral",
  pending: "warning",
};

export default async function AdminActivationRequestsPage() {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") redirect("/");

  const requests = await getActivationRequests();

  return (
    <main className="flex-1 max-w-[960px] w-full mx-auto px-6 py-10">
      <header className="mb-7">
        <h1 className="text-[26px] tracking-tightest text-fg leading-none">
          Activation Requests
        </h1>
      </header>

      <Section title={`last ${requests.length} requests`}>
        {requests.length === 0 ? (
          <Empty>no activation requests</Empty>
        ) : (
          requests.map(req => (
            <div
              key={req.public_id}
              className="border-b border-border last:border-0 px-4 py-2.5 flex items-center gap-4 text-[13px]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-fg">{req.app_name}</span>
                  <Tag tone={statusTone[req.status] ?? "neutral"}>{req.status}</Tag>
                </div>
                <div className="text-muted text-meta mt-0.5">
                  {req.requested_subject && `sub: ${req.requested_subject} · `}
                  {req.approved_username && `approved by @${req.approved_username} · `}
                  id: {req.public_id}
                </div>
              </div>
              <div className="text-faint text-meta shrink-0">
                {req.created_at?.slice(0, 10)}
              </div>
            </div>
          ))
        )}
      </Section>
    </main>
  );
}

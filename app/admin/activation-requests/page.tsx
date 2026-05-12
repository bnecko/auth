import { Section, Empty, Row, RowLabel, RowValue } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
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

const statusTone: Record<
  string,
  "success" | "danger" | "warning" | "neutral"
> = {
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
    <main
      className="flex-1 max-w-[1040px] w-full mx-auto px-6 py-10"
      data-mount-stagger
    >
      <header className="mb-10" data-mount-row>
        <div className="flex items-baseline gap-2 mb-2 text-meta">
          <span className="text-danger">$</span>
          <span className="uppercase tracking-wider text-muted">
            admin.activations
          </span>
          <span className="text-faint">·</span>
          <span className="text-meta text-faint tabular-nums">
            {String(requests.length).padStart(2, "0")}
          </span>
        </div>
        <h1 className="text-[32px] tracking-tightest text-fg leading-none">
          activation requests
        </h1>
      </header>

      <div data-mount-row>
        <Section
          index="1.0"
          title="recent activations"
          hint={`last ${requests.length}`}
        >
          {requests.length === 0 ? (
            <Empty>no activation requests</Empty>
          ) : (
            requests.map(req => (
              <Row key={req.public_id}>
                <RowLabel>
                  <span className="flex items-baseline gap-2">
                    <span className="text-fg normal-case tracking-normal truncate">
                      {req.app_name}
                    </span>
                    <Tag tone={statusTone[req.status] ?? "neutral"}>
                      {req.status}
                    </Tag>
                  </span>
                </RowLabel>
                <RowValue>
                  {req.approved_username && (
                    <>
                      <Glyph kind="ok" />
                      <span className="text-muted truncate">
                        @{req.approved_username}
                      </span>
                      <Glyph kind="dot" />
                    </>
                  )}
                  {req.requested_subject && (
                    <>
                      <span className="text-faint truncate">
                        sub:{req.requested_subject}
                      </span>
                      <Glyph kind="dot" />
                    </>
                  )}
                  <span className="text-faint truncate">{req.public_id}</span>
                </RowValue>
                <span className="text-meta text-faint tabular-nums">
                  {req.created_at?.slice(0, 10)}
                </span>
              </Row>
            ))
          )}
        </Section>
      </div>
    </main>
  );
}

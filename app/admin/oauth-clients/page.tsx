import { Empty, Section } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { listPendingOAuthClientRegistrationRequests } from "@/lib/server/repositories/oauthClientRegistrations";
import {
  approveOAuthClientRegistrationAction,
  denyOAuthClientRegistrationAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminOAuthClientsPage() {
  const requests = await listPendingOAuthClientRegistrationRequests();

  return (
    <main className="flex-1 max-w-[1040px] w-full mx-auto px-6 py-10">
      <header className="mb-7">
        <h1 className="text-[26px] tracking-tightest text-fg leading-none">
          OAuth Client Reviews
        </h1>
      </header>

      <Section title={`pending ${requests.length}`}>
        {requests.length === 0 ? (
          <Empty>no pending clients</Empty>
        ) : (
          requests.map(request => (
            <div
              key={request.id}
              className="border-b border-border last:border-0 px-4 py-4"
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-[15px] text-fg truncate">
                      {request.clientName}
                    </div>
                    <Tag tone="warning">{request.clientType}</Tag>
                  </div>
                  <div className="mt-1 text-meta text-muted">
                    {request.publicId} · {request.tokenEndpointAuthMethod}
                  </div>
                </div>
                <div className="text-meta text-faint shrink-0">
                  {request.createdAt.slice(0, 16).replace("T", " ")}
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-[12px] text-secondary">
                <div>
                  <span className="text-muted">redirects:</span>{" "}
                  {request.redirectUris.join(", ")}
                </div>
                <div>
                  <span className="text-muted">grants:</span>{" "}
                  {request.grantTypes.join(", ")}
                </div>
                <div>
                  <span className="text-muted">scopes:</span>{" "}
                  {request.scopes.join(", ")}
                </div>
                <div>
                  <span className="text-muted">requester:</span>{" "}
                  {request.requesterIp || "unknown"}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <form action={approveOAuthClientRegistrationAction}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <button className="h-8 px-3 rounded-sm bg-fg text-bg text-[12px] font-medium">
                    approve
                  </button>
                </form>
                <form action={denyOAuthClientRegistrationAction}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <button className="h-8 px-3 rounded-sm border border-border text-secondary text-[12px] hover:text-fg">
                    deny
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

import { Empty, Section } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
import { listPendingOAuthClientRegistrationRequests } from "@/lib/server/repositories/oauthClientRegistrations";
import {
  approveOAuthClientRegistrationAction,
  denyOAuthClientRegistrationAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminOAuthClientsPage() {
  const requests = await listPendingOAuthClientRegistrationRequests();

  return (
    <main
      className="flex-1 max-w-[1040px] w-full mx-auto px-6 py-10"
      data-mount-stagger
    >
      <header className="mb-10" data-mount-row>
        <div className="flex items-baseline gap-2 mb-2 text-meta">
          <span className="text-danger">$</span>
          <span className="uppercase tracking-wider text-muted">
            admin.oauth.clients
          </span>
          <span className="text-faint">·</span>
          <span className="text-meta text-faint tabular-nums">
            {String(requests.length).padStart(2, "0")} pending
          </span>
        </div>
        <h1 className="text-[32px] tracking-tightest text-fg leading-none">
          oauth client reviews
        </h1>
      </header>

      <div data-mount-row>
        <Section
          index="1.0"
          title="pending registrations"
          hint="awaiting approval"
        >
          {requests.length === 0 ? (
            <Empty>no pending clients</Empty>
          ) : (
            requests.map(request => (
              <div
                key={request.id}
                className="border-t border-rule first:border-t-0 py-4 px-1"
              >
                <div className="flex items-start gap-4 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[15px] text-fg truncate">
                        {request.clientName}
                      </span>
                      <Tag tone="warning">{request.clientType}</Tag>
                      <Tag
                        tone={
                          request.oauthProfileVersion === "bn-oauth-2026-05"
                            ? "success"
                            : "warning"
                        }
                      >
                        {request.oauthProfileVersion}
                      </Tag>
                    </div>
                    <div className="mt-1 text-meta text-muted">
                      {request.publicId}{" "}
                      <span className="text-faint">·</span>{" "}
                      {request.tokenEndpointAuthMethod}
                    </div>
                  </div>
                  <div className="text-meta text-faint shrink-0 tabular-nums">
                    {request.createdAt.slice(0, 16).replace("T", " ")}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-meta">
                  <dt className="text-muted uppercase tracking-wider">
                    redirects
                  </dt>
                  <dd className="text-fg break-all">
                    {request.redirectUris.join(", ")}
                  </dd>
                  <dt className="text-muted uppercase tracking-wider">
                    grants
                  </dt>
                  <dd className="text-fg">{request.grantTypes.join(", ")}</dd>
                  <dt className="text-muted uppercase tracking-wider">
                    scopes
                  </dt>
                  <dd className="text-fg">{request.scopes.join(", ")}</dd>
                  <dt className="text-muted uppercase tracking-wider">
                    requester
                  </dt>
                  <dd className="text-fg">
                    {request.requesterIp || "unknown"}
                  </dd>
                </dl>

                <div className="mt-4 flex items-baseline gap-5 text-meta uppercase tracking-wider">
                  <form action={approveOAuthClientRegistrationAction}>
                    <input type="hidden" name="request_id" value={request.id} />
                    <button
                      type="submit"
                      className="text-ok hover:text-fg transition-colors flex items-baseline gap-1.5"
                    >
                      <Glyph kind="ok" />
                      <span>approve</span>
                    </button>
                  </form>
                  <form action={denyOAuthClientRegistrationAction}>
                    <input type="hidden" name="request_id" value={request.id} />
                    <button
                      type="submit"
                      className="text-secondary hover:text-danger transition-colors flex items-baseline gap-1.5"
                    >
                      <Glyph kind="error" />
                      <span>deny</span>
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </Section>
      </div>
    </main>
  );
}

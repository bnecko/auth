import { Empty, Section } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { ConfirmButton } from "@/components/ConfirmButton";
import { listExternalAppsForAdmin } from "@/lib/server/repositories/externalApps";
import { listPendingOAuthClientRegistrationRequests } from "@/lib/server/repositories/oauthClientRegistrations";
import {
  approveOAuthClientRegistrationAction,
  denyOAuthClientRegistrationAction,
  setExternalAppStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminOAuthClientsPage() {
  const requests = await listPendingOAuthClientRegistrationRequests();
  const apps = await listExternalAppsForAdmin();

  return (
    <>
      <header className="mb-10" data-mount-row>
        <div className="flex items-baseline gap-2 mb-2 text-[13px]">
          <span className="text-muted">Admin</span>
          <span className="text-faint">·</span>
          <span className="text-muted">OAuth clients</span>
          <span className="text-faint">·</span>
          <span className="text-faint tabular-nums">
            {String(requests.length).padStart(2, "0")} pending
          </span>
        </div>
        <h1 className="text-[32px] text-fg leading-none">
          OAuth client reviews
        </h1>
      </header>

      <div data-mount-row>
        <Section
          index="1.0"
          title="Pending registrations"
          hint="Awaiting approval"
        >
          {requests.length === 0 ? (
            <Empty>No pending clients</Empty>
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
                  <dt className="text-[12px] text-muted">
                    redirects
                  </dt>
                  <dd className="text-fg break-all">
                    {request.redirectUris.join(", ")}
                  </dd>
                  <dt className="text-[12px] text-muted">
                    grants
                  </dt>
                  <dd className="text-fg">{request.grantTypes.join(", ")}</dd>
                  <dt className="text-[12px] text-muted">
                    scopes
                  </dt>
                  <dd className="text-fg">{request.scopes.join(", ")}</dd>
                  <dt className="text-[12px] text-muted">
                    requester
                  </dt>
                  <dd className="text-fg">
                    {request.requesterIp || "unknown"}
                  </dd>
                </dl>

                <div className="mt-4 flex items-center gap-2">
                  <ConfirmButton
                    action={approveOAuthClientRegistrationAction}
                    fields={{ request_id: request.id }}
                    label="Approve"
                    triggerVariant="primary"
                    tone="neutral"
                    title="Approve this client registration?"
                    message="The OAuth client is created and issued credentials."
                    confirmLabel="Approve"
                  />
                  <ConfirmButton
                    action={denyOAuthClientRegistrationAction}
                    fields={{ request_id: request.id }}
                    label="Deny"
                    triggerVariant="danger"
                    tone="danger"
                    title="Deny this client registration?"
                    message="The registration request is rejected."
                    confirmLabel="Deny"
                  />
                </div>
              </div>
            ))
          )}
        </Section>
      </div>

      <div className="mt-8" data-mount-row>
        <Section
          index="2.0"
          title="Live applications"
          hint="Disable abusive clients"
        >
          {apps.length === 0 ? (
            <Empty>No applications</Empty>
          ) : (
            apps.map(app => (
              <div
                key={app.id}
                className="border-t border-rule first:border-t-0 py-3 px-1 flex items-center gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[15px] text-fg truncate">{app.name}</span>
                    <Tag tone={app.status === "active" ? "success" : "danger"}>
                      {app.status}
                    </Tag>
                    {app.revokedByOwner && (
                      <Tag tone="danger">revoked by owner</Tag>
                    )}
                  </div>
                  <div className="mt-1 text-meta text-muted break-all">
                    {app.publicId}{" "}
                    <span className="text-faint">·</span>{" "}
                    {app.ownerUsername || "no owner"}
                  </div>
                </div>
                <div className="text-meta text-faint shrink-0 tabular-nums">
                  {app.createdAt.slice(0, 10)}
                </div>
                {app.status === "active" ? (
                  <ConfirmButton
                    action={setExternalAppStatusAction}
                    fields={{ app_id: app.id, status: "disabled" }}
                    label="Disable"
                    triggerVariant="danger"
                    tone="danger"
                    title={`Disable ${app.name}?`}
                    message="The app immediately stops authenticating on every surface: OAuth, activation API, and logout."
                    confirmLabel="Disable"
                  />
                ) : app.revokedByOwner ? null : (
                  <ConfirmButton
                    action={setExternalAppStatusAction}
                    fields={{ app_id: app.id, status: "active" }}
                    label="Enable"
                    triggerVariant="secondary"
                    tone="neutral"
                    title={`Re-enable ${app.name}?`}
                    message="The app's existing credentials start working again."
                    confirmLabel="Enable"
                  />
                )}
              </div>
            ))
          )}
        </Section>
      </div>
    </>
  );
}

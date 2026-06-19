import { redirect } from "next/navigation";
import { Alert } from "@/components/Alert";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { mintAuthorizeCsrf } from "@/lib/server/oauthCsrf";
import {
  getOAuthAuthorizeView,
  OAuthError,
  oauthAuthorizeQuery,
  oauthRedirectError,
} from "@/lib/server/services/oauth";

export const dynamic = "force-dynamic";

const scopeLabels: Record<string, { label: string; sensitive?: boolean }> = {
  openid: { label: "account identifier" },
  profile: { label: "profile" },
  email: { label: "email address", sensitive: true },
  birthdate: { label: "date of birth", sensitive: true },
  "profile:read": { label: "public profile" },
  "email:read": { label: "email address", sensitive: true },
  "dob:read": { label: "date of birth", sensitive: true },
  "subscription:read": { label: "subscription status" },
};

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const current = await getCurrentSession();

  let view;
  try {
    view = await getOAuthAuthorizeView(
      params,
      current?.user || null,
      current?.session.createdAt || null,
    );
  } catch (err) {
    if (err instanceof OAuthError && err.redirectUri) {
      const target = oauthRedirectError(
        err.redirectUri,
        err.code,
        err.message,
        err.state,
      );
      redirect(target.toString());
    }
    return (
      <AuthShell tag="oauth/error">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[13px] text-danger font-medium">OAuth error</span>
        </div>
        <h1 className="text-[28px] text-fg mb-5 leading-none">
          Authorization failed
        </h1>
        <Alert tone="danger">
          {err instanceof OAuthError
            ? err.message
            : "Invalid authorization request"}
        </Alert>
      </AuthShell>
    );
  }

  const next = `/oauth/authorize?${oauthAuthorizeQuery(view)}`;
  if (!current) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (view.requireReauth) {
    redirect(`/api/oauth/reauth?next=${encodeURIComponent(next)}`);
  }

  const csrfToken = mintAuthorizeCsrf({
    sessionId: current.session.id,
    clientId: view.clientId,
    state: view.state,
  });

  const sensitiveScopes = view.scopes.filter(s => scopeLabels[s]?.sensitive);
  const standardScopes = view.scopes.filter(s => !scopeLabels[s]?.sensitive);

  return (
    <AuthShell tag="oauth/authorize">
      <div className="flex items-start gap-4 mb-7">
        <div
          className="h-12 w-12 border border-accent rounded-md flex items-center justify-center text-accent-strong text-[13px] font-medium shrink-0"
          aria-hidden
        >
          {view.app.name.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-muted mb-1">
            Authorize app
          </div>
          <h1 className="text-[26px] text-fg truncate leading-none">
            {view.app.name}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Tag tone="success">oauth</Tag>
            <span className="text-meta text-muted truncate">
              {view.app.publicId}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-rule mb-5">
        <DetailRow label="signed in" value={current.user.username} />
        <DetailRow label="email" value={current.user.email} />
        <DetailRow label="redirect" value={view.redirectUri} mono />
        <DetailRow
          label="access"
          value={
            view.existingScopes.length > 0
              ? "previous authorization"
              : "new authorization"
          }
        />
        {view.requiredProduct && (
          <DetailRow
            label="requires"
            value={view.requiredProduct}
            right={
              <Tag tone={view.subscriptionOk ? "success" : "warning"}>
                {view.subscriptionOk ? "active" : "missing"}
              </Tag>
            }
          />
        )}
        <div className="border-t border-rule" />
      </div>

      <div className="mb-5">
        <div className="text-[12px] text-muted mb-2">
          Will share
        </div>
        <div className="border-t border-rule">
          {standardScopes.map((scope) => {
            const item = scopeLabels[scope] || { label: scope };
            return (
              <div
                key={scope}
                className="flex items-center gap-3 py-2.5 border-b border-rule"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden />
                <span className="text-[13px] text-fg flex-1">{item.label}</span>
                <input
                  type="hidden"
                  name="scopes"
                  value={scope}
                  form="oauth-approve-form"
                />
              </div>
            );
          })}
          {sensitiveScopes.map((scope) => {
            const item = scopeLabels[scope] || { label: scope };
            return (
              <label
                key={scope}
                className="flex items-center gap-3 py-2.5 border-b border-rule cursor-pointer group"
              >
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  defaultChecked
                  form="oauth-approve-form"
                  className="appearance-none w-4 h-4 border border-rule rounded bg-transparent checked:bg-accent checked:border-accent transition-colors shrink-0"
                />
                <span className="text-[13px] text-fg flex-1 group-hover:text-accent-strong transition-colors">
                  {item.label}
                </span>
                <span className="text-[11px] text-accent-strong">
                  Optional
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {!view.subscriptionOk && view.requiredProduct && (
        <div className="mb-5">
          <Alert tone="warning">
            Active {view.requiredProduct} subscription required to approve
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-2">
        <form action="/api/oauth/authorize/deny" method="post">
          <HiddenOAuthFields view={view} csrfToken={csrfToken} />
          <Button variant="ghost" type="submit">
            Deny
          </Button>
        </form>
        <form
          id="oauth-approve-form"
          action="/api/oauth/authorize/approve"
          method="post"
        >
          <HiddenOAuthFields view={view} csrfToken={csrfToken} />
          <Button type="submit" disabled={!view.subscriptionOk}>
            Approve
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

function HiddenOAuthFields({
  view,
  csrfToken,
}: {
  view: Awaited<ReturnType<typeof getOAuthAuthorizeView>>;
  csrfToken: string;
}) {
  return (
    <>
      <input type="hidden" name="response_type" value="code" />
      <input type="hidden" name="client_id" value={view.clientId} />
      <input type="hidden" name="redirect_uri" value={view.redirectUri} />
      <input type="hidden" name="scope" value={view.scope} />
      <input type="hidden" name="state" value={view.state} />
      <input type="hidden" name="code_challenge" value={view.codeChallenge} />
      <input type="hidden" name="code_challenge_method" value="S256" />
      <input type="hidden" name="nonce" value={view.nonce} />
      <input type="hidden" name="csrf_token" value={csrfToken} />
    </>
  );
}

function DetailRow({
  label,
  value,
  right,
  mono = false,
}: {
  label: string;
  value: string;
  right?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-rule last:border-b-0">
      <span className="text-[12px] text-muted shrink-0">
        {label}
      </span>
      <span className="text-[13px] text-right truncate flex-1 flex items-center justify-end gap-2">
        <span className={`truncate ${mono ? "text-fg" : "text-fg"}`}>
          {value}
        </span>
        {right}
      </span>
    </div>
  );
}

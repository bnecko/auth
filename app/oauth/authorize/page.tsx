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
    // OIDC silent-failure errors (login_required, consent_required)
    // arrive here with a validated redirect_uri attached. Redirect the
    // user-agent back to the client with the OAuth error params rather
    // than rendering a server-side error page — per RFC 6749 §4.1.2.1.
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
        <h1 className="text-[24px] tracking-tightest text-fg mb-4">
          authorization failed
        </h1>
        <Alert tone="danger">
          {err instanceof OAuthError ? err.message : "invalid authorization request"}
        </Alert>
      </AuthShell>
    );
  }

  const next = `/oauth/authorize?${oauthAuthorizeQuery(view)}`;
  if (!current) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (view.requireReauth) {
    // prompt=login or max_age exceeded — bounce through /api/oauth/reauth
    // so the existing session cookie + DB row are cleared before /login
    // runs. The fresh login is then the only valid session.
    redirect(`/api/oauth/reauth?next=${encodeURIComponent(next)}`);
  }

  const csrfToken = mintAuthorizeCsrf({
    sessionId: current.session.id,
    clientId: view.clientId,
    state: view.state,
  });

  return (
    <AuthShell tag="oauth/authorize">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="text-micro uppercase text-faint mb-1">
            authorize app
          </div>
          <h1 className="text-[24px] tracking-tightest text-fg truncate">
            {view.app.name}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Tag tone="success">oauth</Tag>
            <span className="text-meta text-muted truncate">
              client {view.app.publicId}
            </span>
          </div>
        </div>
        <div
          className="h-10 w-10 rounded-sm bg-elevated border border-border flex items-center justify-center text-secondary text-meta shrink-0"
          aria-hidden
        >
          {view.app.name.slice(0, 2).toUpperCase()}
        </div>
      </div>

      <div className="space-y-2.5 mb-4">
        <Row label="signed in" value={`${current.user.username} / ${current.user.email}`} />
        <Row label="redirect" value={view.redirectUri} />
        <Row
          label="access"
          value={
            view.existingScopes.length > 0
              ? "previous authorization found"
              : "new authorization"
          }
        />
        <Row
          label="requires"
          value={view.requiredProduct || "none"}
          right={
            view.requiredProduct ? (
              <Tag tone={view.subscriptionOk ? "success" : "warning"}>
                {view.subscriptionOk ? "active" : "missing"}
              </Tag>
            ) : undefined
          }
        />
      </div>

      <div className="mb-4">
        <div className="text-micro uppercase text-faint mb-2">
          will share
        </div>
        <ul className="border border-border rounded-sm divide-y divide-border bg-bg">
          {view.scopes.map(scope => {
            const item = scopeLabels[scope] || { label: scope };
            return (
              <li
                key={scope}
                className="flex items-center justify-between px-3 py-2 text-[13px]"
              >
                {item.sensitive ? (
                  <label className="flex items-center gap-2 cursor-pointer text-fg">
                    <input
                      type="checkbox"
                      name="scopes"
                      value={scope}
                      defaultChecked
                      form="oauth-approve-form"
                      className="rounded-sm border-border bg-transparent focus:ring-1 focus:ring-border accent-fg"
                    />
                    <span>{item.label}</span>
                  </label>
                ) : (
                  <>
                    <span className="text-fg">{item.label}</span>
                    <input
                      type="hidden"
                      name="scopes"
                      value={scope}
                      form="oauth-approve-form"
                    />
                  </>
                )}
                {item.sensitive && (
                  <span className="text-micro uppercase text-warning">
                    optional
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {!view.subscriptionOk && view.requiredProduct && (
        <div className="mb-4">
          <Alert tone="warning">
            active {view.requiredProduct} subscription required to approve.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-2">
        <form action="/api/oauth/authorize/deny" method="post">
          <HiddenOAuthFields view={view} csrfToken={csrfToken} />
          <Button variant="ghost" type="submit">
            deny
          </Button>
        </form>
        <form
          id="oauth-approve-form"
          action="/api/oauth/authorize/approve"
          method="post"
        >
          <HiddenOAuthFields view={view} csrfToken={csrfToken} />
          <Button type="submit" disabled={!view.subscriptionOk}>
            approve
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

function Row({
  label,
  value,
  right,
}: {
  label: string;
  value: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13px]">
      <span className="text-meta text-muted shrink-0">{label}</span>
      <span className="text-fg text-right truncate flex-1 flex items-center justify-end gap-2">
        <span className="truncate">{value}</span>
        {right}
      </span>
    </div>
  );
}

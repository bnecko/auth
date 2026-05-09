import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const baseUrl = "https://auth.bottleneck.cc";

const endpoints = [
  ["/oauth/authorize", "browser authorization and consent"],
  ["/api/oauth/token", "code exchange and refresh"],
  ["/api/oauth/userinfo", "profile claims for access tokens"],
  ["/api/oauth/introspect", "token status for confidential clients"],
  ["/api/oauth/revoke", "access or refresh token revocation"],
  ["/oauth/jwks", "public signing keys for ID tokens"],
];

const scopes = [
  ["openid", "returns an OIDC ID token"],
  ["profile", "name and preferred username"],
  ["email", "email and email verification status"],
  ["birthdate", "date of birth claim"],
  ["subscription:read", "reserved for subscription-aware clients"],
];

export default async function OAuthDocsPage() {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login?next=/developers/oauth");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{
          name: current.user.firstName,
          username: current.user.username,
        }}
      />
      <div className="flex-1 min-w-0">
        <TopNav trail="developers / oauth docs" />
        <main className="max-w-[1040px] mx-auto px-6 py-10">
          <header className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-micro uppercase text-faint">developer</span>
              <Tag tone="success">oauth 2.1</Tag>
              <Tag tone="info">oidc</Tag>
            </div>
            <h1 className="text-[30px] leading-none tracking-tightest text-fg">
              Bottleneck OAuth
            </h1>
            <p className="mt-3 text-[13px] leading-6 text-muted max-w-[760px]">
              Use this service as an authorization server for Bottleneck apps.
              Clients use Authorization Code with PKCE, opaque access tokens,
              rotating refresh tokens, and RS256 ID tokens when `openid` is
              requested.
            </p>
          </header>

          <div className="grid lg:grid-cols-[1fr_260px] gap-6 items-start">
            <article className="border border-border bg-surface rounded-sm overflow-hidden">
              <DocSection id="client" title="client setup">
                <p>
                  Each OAuth client is an `external_apps` record. Use the app
                  public id as `client_id`, and use the issued API key as
                  `client_secret` for confidential clients.
                </p>
                <Code>{`client_id=app_public_id
client_secret=issued_app_api_key
redirect_uri=https://yourapp.example/oauth/callback`}</Code>
              </DocSection>

              <DocSection id="authorize" title="authorize">
                <p>
                  Redirect the user to the authorization endpoint. `state`,
                  `nonce`, and PKCE values should be generated per request by
                  the client app.
                </p>
                <Code>{`${baseUrl}/oauth/authorize?response_type=code&client_id=app_xxx&redirect_uri=https%3A%2F%2Fyourapp.example%2Foauth%2Fcallback&scope=openid%20profile%20email&state=random_state&nonce=random_nonce&code_challenge=pkce_challenge&code_challenge_method=S256`}</Code>
              </DocSection>

              <DocSection id="token" title="token exchange">
                <p>
                  Exchange the returned code from your backend. Public clients
                  may omit `client_secret`, but PKCE is always required.
                </p>
                <Code>{`POST ${baseUrl}/api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
client_id=app_xxx&
client_secret=issued_app_api_key&
code=returned_code&
redirect_uri=https://yourapp.example/oauth/callback&
code_verifier=pkce_verifier`}</Code>
              </DocSection>

              <DocSection id="refresh" title="refresh">
                <p>
                  Refresh tokens rotate. Store the newest refresh token and
                  discard the old one after every successful response.
                </p>
                <Code>{`POST ${baseUrl}/api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
client_id=app_xxx&
client_secret=issued_app_api_key&
refresh_token=stored_refresh_token`}</Code>
              </DocSection>

              <DocSection id="userinfo" title="userinfo">
                <p>
                  Call userinfo with an access token. The response only includes
                  fields covered by the granted scopes.
                </p>
                <Code>{`GET ${baseUrl}/api/oauth/userinfo
Authorization: Bearer access_token`}</Code>
              </DocSection>

              <DocSection id="endpoints" title="endpoints">
                <div className="divide-y divide-border border border-border rounded-sm">
                  {endpoints.map(([path, detail]) => (
                    <div
                      key={path}
                      className="grid sm:grid-cols-[220px_1fr] gap-3 px-3 py-2.5 text-[13px]"
                    >
                      <span className="text-fg">{path}</span>
                      <span className="text-muted">{detail}</span>
                    </div>
                  ))}
                </div>
              </DocSection>

              <DocSection id="scopes" title="scopes">
                <div className="divide-y divide-border border border-border rounded-sm">
                  {scopes.map(([scope, detail]) => (
                    <div
                      key={scope}
                      className="grid sm:grid-cols-[180px_1fr] gap-3 px-3 py-2.5 text-[13px]"
                    >
                      <span className="text-fg">{scope}</span>
                      <span className="text-muted">{detail}</span>
                    </div>
                  ))}
                </div>
              </DocSection>
            </article>

            <aside className="border border-border bg-surface rounded-sm p-4 sticky top-16">
              <div className="text-micro uppercase text-faint mb-3">
                on this page
              </div>
              <nav className="space-y-1 text-[13px]">
                {[
                  ["#client", "client setup"],
                  ["#authorize", "authorize"],
                  ["#token", "token exchange"],
                  ["#refresh", "refresh"],
                  ["#userinfo", "userinfo"],
                  ["#endpoints", "endpoints"],
                  ["#scopes", "scopes"],
                ].map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    className="block px-2 h-7 leading-7 rounded-sm text-secondary hover:text-fg hover:bg-hover transition-colors"
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-b border-border last:border-b-0 p-5">
      <h2 className="text-micro uppercase tracking-[0.08em] text-muted mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-[13px] leading-6 text-secondary">
        {children}
      </div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-sm border border-border bg-bg px-3 py-3 text-[12px] leading-5 text-fg">
      <code>{children}</code>
    </pre>
  );
}

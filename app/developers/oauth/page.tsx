import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const baseUrl = "https://auth.bottleneck.cc";

const endpoints = [
  ["/api/oauth/register", "dynamic client registration (dcr)"],
  ["/api/oauth/par", "pushed authorization requests (par)"],
  ["/api/oauth/device/code", "device authorization grant code request"],
  ["/oauth/authorize", "browser authorization and consent"],
  ["/api/oauth/token", "code exchange, device polling, and refresh"],
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
              Use this service as an authorization server for your applications.
              We support modern, hardened OAuth 2.1 flows including Pushed Authorization Requests (PAR),
              Device Authorization Grant, and Dynamic Client Registration (DCR).
            </p>
          </header>

          <div className="grid lg:grid-cols-[1fr_260px] gap-6 items-start">
            <article className="border border-border bg-surface rounded-sm overflow-hidden">
              <DocSection id="dcr" title="dynamic client registration (rfc 7591)">
                <p>
                  Register a new OAuth client programmatically. This endpoint is strictly rate-limited
                  (5 registrations per hour per IP) to prevent abuse.
                </p>
                <Code title="cURL">{`curl -X POST ${baseUrl}/api/oauth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_name": "My CLI App",
    "redirect_uris": ["http://localhost:8080/callback"]
  }'`}</Code>
                <Code title="Node.js">{`const response = await fetch('${baseUrl}/api/oauth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'My Node App',
    redirect_uris: ['http://localhost:8080/callback']
  })
});
const client = await response.json();
console.log(client.client_id, client.client_secret);`}</Code>
                <Code title="Python">{`import requests

res = requests.post('${baseUrl}/api/oauth/register', json={
    "client_name": "My Python App",
    "redirect_uris": ["http://localhost:8080/callback"]
})
client = res.json()
print(client['client_id'], client['client_secret'])`}</Code>
              </DocSection>

              <DocSection id="par" title="pushed authorization requests (rfc 9126)">
                <p>
                  Confidential clients must use PAR to push authorization payloads directly to the server, keeping
                  URLs clean and secure. Send the payload and you will receive a <code>request_uri</code>.
                </p>
                <Code title="cURL">{`curl -X POST ${baseUrl}/api/oauth/par \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "response_type=code" \\
  -d "redirect_uri=https://yourapp.example/oauth/callback" \\
  -d "scope=openid profile email" \\
  -d "state=random_state" \\
  -d "code_challenge=pkce_challenge" \\
  -d "code_challenge_method=S256"`}</Code>
                <p>
                  You then redirect the user to <code>{baseUrl}/oauth/authorize?client_id=app_xxx&request_uri=urn:ietf:params:oauth:request_uri:XYZ</code>.
                </p>
              </DocSection>

              <DocSection id="device" title="device authorization grant (rfc 8628)">
                <p>
                  Headless devices (like TVs or CLIs) can initiate a device login. The device displays a user code,
                  and the user approves it on their mobile phone or desktop.
                </p>
                <Code title="cURL (Initiation)">{`curl -X POST ${baseUrl}/api/oauth/device/code \\
  -d "client_id=app_xxx" \\
  -d "scope=openid profile"`}</Code>
                <Code title="cURL (Polling)">{`# Poll this endpoint every {interval} seconds until authorized
curl -X POST ${baseUrl}/api/oauth/token \\
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \\
  -d "client_id=app_xxx" \\
  -d "device_code=returned_device_code"`}</Code>
              </DocSection>

              <DocSection id="authorize" title="standard authorize">
                <p>
                  If not using PAR or Device Grant, standard authorization requires PKCE. Redirect the user's browser:
                </p>
                <Code title="Browser">{`${baseUrl}/oauth/authorize?response_type=code&client_id=app_xxx&redirect_uri=https%3A%2F%2Fyourapp.example%2Foauth%2Fcallback&scope=openid%20profile%20email&state=random_state&code_challenge=pkce_challenge&code_challenge_method=S256`}</Code>
              </DocSection>

              <DocSection id="token" title="token exchange">
                <p>
                  Exchange the returned authorization code for access and refresh tokens.
                </p>
                <Code title="Node.js">{`const response = await fetch('${baseUrl}/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'app_xxx',
    client_secret: 'sec_xxx', // Public clients omit this
    code: 'returned_code',
    redirect_uri: 'https://yourapp.example/oauth/callback',
    code_verifier: 'pkce_verifier'
  })
});
const tokens = await response.json();`}</Code>
              </DocSection>

              <DocSection id="refresh" title="refresh">
                <p>
                  Refresh tokens automatically rotate on use. Always store the new refresh token returned.
                </p>
                <Code title="Python">{`import requests

res = requests.post('${baseUrl}/api/oauth/token', data={
    "grant_type": "refresh_token",
    "client_id": "app_xxx",
    "client_secret": "sec_xxx",
    "refresh_token": "stored_refresh_token"
})
tokens = res.json()`}</Code>
              </DocSection>

              <DocSection id="endpoints" title="endpoints">
                <div className="divide-y divide-border border border-border rounded-sm">
                  {endpoints.map(([path, detail]) => (
                    <div
                      key={path}
                      className="grid sm:grid-cols-[260px_1fr] gap-3 px-3 py-2.5 text-[13px]"
                    >
                      <span className="text-fg font-mono text-[12px]">{path}</span>
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
                      <span className="text-fg font-mono text-[12px]">{scope}</span>
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
                  ["#dcr", "dynamic client registration"],
                  ["#par", "pushed authorization requests"],
                  ["#device", "device grant"],
                  ["#authorize", "standard authorize"],
                  ["#token", "token exchange"],
                  ["#refresh", "refresh"],
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
      <div className="space-y-4 text-[13px] leading-6 text-secondary">
        {children}
      </div>
    </section>
  );
}

function Code({ title, children }: { title?: string; children: string }) {
  return (
    <div className="rounded-sm border border-border bg-bg overflow-hidden">
      {title && (
        <div className="px-3 py-1.5 border-b border-border bg-surface text-micro uppercase text-faint font-medium">
          {title}
        </div>
      )}
      <pre className="overflow-x-auto px-3 py-3 text-[12px] leading-5 text-fg">
        <code>{children}</code>
      </pre>
    </div>
  );
}

import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
import { CodeTabs } from "./CodeTabs";

export const dynamic = "force-dynamic";

const base = "https://auth.bottleneck.cc";

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
        <main className="max-w-[1080px] mx-auto px-6 py-10">
          <header className="mb-10">
            <div className="flex items-baseline gap-2 mb-2 text-meta">
              <span className="text-accent">$</span>
              <span className="uppercase tracking-wider text-muted">
                docs.oauth
              </span>
              <span className="text-faint">·</span>
              <Tag tone="success">oauth 2.1</Tag>
              <Tag tone="info">oidc</Tag>
            </div>
            <h1 className="text-[36px] leading-none tracking-tightest text-fg mb-3">
              bottleneck oauth
            </h1>
            <p className="text-meta text-muted leading-6 max-w-[680px]">
              bottleneck acts as an authorization server for your applications.
              it supports oauth 2.1 with pkce, openid connect, pushed
              authorization requests, device authorization grant, restricted
              dynamic client registration, and a proprietary bearer key system
              for server-to-server access.
            </p>
          </header>

          <div className="grid lg:grid-cols-[1fr_220px] gap-10 items-start">
            <article>
              <DocSection id="discovery" index="1.0" title="discovery">
                <p>
                  the server publishes a standard oidc discovery document. point
                  any oidc-compatible library here and all endpoint urls,
                  signing key locations, and supported features are resolved
                  automatically.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl ${base}/.well-known/openid-configuration`,
                    },
                    {
                      label: "Node.js",
                      code: `const config = await fetch(
  '${base}/.well-known/openid-configuration'
).then(r => r.json());

// config.authorization_endpoint, config.token_endpoint, config.jwks_uri, ...`,
                    },
                    {
                      label: "Python",
                      code: `import requests

config = requests.get(
  '${base}/.well-known/openid-configuration'
).json()

# config['authorization_endpoint'], config['token_endpoint'], ...`,
                    },
                  ]}
                />
                <p>
                  the oauth 2.0 authorization server metadata is also available
                  at <code>{base}/.well-known/oauth-authorization-server</code>.
                </p>
              </DocSection>

              <DocSection id="dcr" index="2.0" title="dynamic client registration (rfc 7591)">
                <p>
                  register a client programmatically with a registration bearer
                  token. new clients enter admin review first. poll the returned
                  registration uri with the registration access token; approved
                  confidential clients reveal <code>client_secret</code> once.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl -X POST ${base}/api/oauth/register \\
  -H "Authorization: Bearer REGISTRATION_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_name": "My App",
    "redirect_uris": ["https://yourapp.example/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "token_endpoint_auth_method": "client_secret_post"
  }'`,
                    },
                    {
                      label: "Node.js",
                      code: `const res = await fetch('${base}/api/oauth/register', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer REGISTRATION_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    client_name: 'My App',
    redirect_uris: ['https://yourapp.example/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
  })
});
const pending = await res.json();
const approved = await fetch(pending.registration_client_uri, {
  headers: { Authorization: \`Bearer \${pending.registration_access_token}\` },
});
const { client_id, client_secret } = await approved.json();`,
                    },
                    {
                      label: "Python",
                      code: `import requests

res = requests.post('${base}/api/oauth/register', headers={
  'Authorization': 'Bearer REGISTRATION_TOKEN',
}, json={
  'client_name': 'My App',
  'redirect_uris': ['https://yourapp.example/callback'],
  'grant_types': ['authorization_code', 'refresh_token'],
})
data = res.json()
approved = requests.get(data['registration_client_uri'], headers={
  'Authorization': f"Bearer {data['registration_access_token']}",
})
client_id = approved.json()['client_id']
client_secret = approved.json().get('client_secret')`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="pkce" index="3.0" title="pkce requirement">
                <p>
                  <strong className="text-accent">
                    pkce s256 is mandatory on every authorization request.
                  </strong>{" "}
                  the server rejects any code exchange that omits{" "}
                  <code>code_verifier</code> or uses the <code>plain</code>{" "}
                  method. generate a cryptographically random verifier and
                  derive the challenge before sending the user to the
                  authorization endpoint.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "Node.js",
                      code: `import { randomBytes, createHash } from 'crypto';

const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256')
  .update(verifier)
  .digest('base64url');

// verifier  → store securely, send at token exchange
// challenge → send in the authorization request`,
                    },
                    {
                      label: "Python",
                      code: `import secrets, hashlib, base64

verifier = secrets.token_urlsafe(48)
digest = hashlib.sha256(verifier.encode()).digest()
challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode()

# verifier  -> store securely, send at token exchange
# challenge -> send in the authorization request`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="authorize" index="4.0" title="standard authorization">
                <p>
                  redirect the user&apos;s browser to the authorization
                  endpoint. include <code>code_challenge</code> and{" "}
                  <code>code_challenge_method=S256</code> (required). use{" "}
                  <code>state</code> to prevent csrf in your callback handler.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "URL",
                      code: `${base}/oauth/authorize
  ?response_type=code
  &client_id=app_xxx
  &redirect_uri=https%3A%2F%2Fyourapp.example%2Fcallback
  &scope=openid%20profile%20email
  &state=random_csrf_token
  &code_challenge=BASE64URL_SHA256_OF_VERIFIER
  &code_challenge_method=S256`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="par" index="5.0" title="pushed authorization requests (rfc 9126)">
                <p>
                  par lets confidential clients push the full authorization
                  payload directly to the server before the redirect. the
                  response is a short-lived <code>request_uri</code> you use in
                  place of inline query parameters.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `# Step 1 - push the request
curl -X POST ${base}/api/oauth/par \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "response_type=code" \\
  -d "redirect_uri=https://yourapp.example/callback" \\
  -d "scope=openid profile email" \\
  -d "state=random_state" \\
  -d "code_challenge=YOUR_CHALLENGE" \\
  -d "code_challenge_method=S256"

# Response: { "request_uri": "urn:ietf:params:oauth:request_uri:...", "expires_in": 60 }

# Step 2 - redirect the user
# ${base}/oauth/authorize?client_id=app_xxx&request_uri=urn%3A...`,
                    },
                    {
                      label: "Node.js",
                      code: `const par = await fetch('${base}/api/oauth/par', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: 'app_xxx',
    client_secret: 'sec_xxx',
    response_type: 'code',
    redirect_uri: 'https://yourapp.example/callback',
    scope: 'openid profile email',
    state: 'random_state',
    code_challenge: 'YOUR_CHALLENGE',
    code_challenge_method: 'S256',
  }),
}).then(r => r.json());

const url = '${base}/oauth/authorize?client_id=app_xxx&request_uri=' +
  encodeURIComponent(par.request_uri);
// redirect the user to url`,
                    },
                    {
                      label: "Python",
                      code: `import requests
from urllib.parse import quote

par = requests.post('${base}/api/oauth/par', data={
  'client_id': 'app_xxx',
  'client_secret': 'sec_xxx',
  'response_type': 'code',
  'redirect_uri': 'https://yourapp.example/callback',
  'scope': 'openid profile email',
  'state': 'random_state',
  'code_challenge': 'YOUR_CHALLENGE',
  'code_challenge_method': 'S256',
}).json()

url = f"${base}/oauth/authorize?client_id=app_xxx&request_uri={quote(par['request_uri'])}"`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="device" index="6.0" title="device authorization grant (rfc 8628)">
                <p>
                  for headless devices (clis, smart tvs, embedded systems) that
                  cannot open a browser. the device displays a short user code;
                  the user approves it on a separate device. poll the token
                  endpoint using the returned <code>interval</code>.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `# Step 1 - request a device code
curl -X POST ${base}/api/oauth/device/code \\
  -d "client_id=app_xxx" \\
  -d "scope=openid profile"

# Response:
# {
#   "device_code": "...",
#   "user_code": "ABCD-1234",
#   "verification_uri": "${base}/device",
#   "verification_uri_complete": "${base}/device?user_code=ABCD-1234",
#   "expires_in": 600,
#   "interval": 5
# }

# Step 2 - show the user_code, then poll every {interval} seconds
curl -X POST ${base}/api/oauth/token \\
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \\
  -d "client_id=app_xxx" \\
  -d "device_code=DEVICE_CODE_FROM_STEP_1"

# Errors while waiting: authorization_pending | slow_down | expired_token | access_denied`,
                    },
                    {
                      label: "Node.js",
                      code: `const init = await fetch('${base}/api/oauth/device/code', {
  method: 'POST',
  body: new URLSearchParams({ client_id: 'app_xxx', scope: 'openid profile' })
}).then(r => r.json());

console.log(\`Go to \${init.verification_uri} and enter: \${init.user_code}\`);

// Poll every init.interval seconds
const tokens = await new Promise((resolve, reject) => {
  const poll = setInterval(async () => {
    const res = await fetch('${base}/api/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: 'app_xxx',
        device_code: init.device_code,
      })
    });
    const data = await res.json();
    if (res.ok) { clearInterval(poll); resolve(data); }
    else if (data.error !== 'authorization_pending' && data.error !== 'slow_down') {
      clearInterval(poll); reject(new Error(data.error));
    }
  }, init.interval * 1000);
});`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="client-credentials" index="7.0" title="client credentials grant">
                <p>
                  for machine-to-machine flows where no user is involved. the
                  client authenticates directly with its credentials. the
                  resulting access token carries no user context:{" "}
                  <code>sub</code> is the app&apos;s public id.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl -X POST ${base}/api/oauth/token \\
  -d "grant_type=client_credentials" \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx"`,
                    },
                    {
                      label: "Node.js",
                      code: `const tokens = await fetch('${base}/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: 'app_xxx',
    client_secret: 'sec_xxx',
  }),
}).then(r => r.json());`,
                    },
                    {
                      label: "Python",
                      code: `import requests

tokens = requests.post('${base}/api/oauth/token', data={
  'grant_type': 'client_credentials',
  'client_id': 'app_xxx',
  'client_secret': 'sec_xxx',
}).json()`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="token" index="8.0" title="token exchange">
                <p>
                  exchange the authorization code for tokens. include the{" "}
                  <code>code_verifier</code> that matches the{" "}
                  <code>code_challenge</code> from the authorization request.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl -X POST ${base}/api/oauth/token \\
  -d "grant_type=authorization_code" \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "code=RETURNED_CODE" \\
  -d "redirect_uri=https://yourapp.example/callback" \\
  -d "code_verifier=YOUR_PKCE_VERIFIER"`,
                    },
                    {
                      label: "Node.js",
                      code: `const res = await fetch('${base}/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'app_xxx',
    client_secret: 'sec_xxx',
    code: returnedCode,
    redirect_uri: 'https://yourapp.example/callback',
    code_verifier: pkceVerifier,
  })
});

const tokens = await res.json();`,
                    },
                    {
                      label: "Python",
                      code: `import requests

res = requests.post('${base}/api/oauth/token', data={
  'grant_type': 'authorization_code',
  'client_id': 'app_xxx',
  'client_secret': 'sec_xxx',
  'code': returned_code,
  'redirect_uri': 'https://yourapp.example/callback',
  'code_verifier': pkce_verifier,
})
tokens = res.json()`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="refresh" index="9.0" title="refresh tokens">
                <p>
                  refresh tokens rotate on every use: the server returns a new
                  refresh token with each response.{" "}
                  <strong className="text-accent">
                    always replace your stored refresh token with the new one.
                  </strong>{" "}
                  replaying a consumed refresh token is treated as a compromise
                  signal: the server immediately revokes all access and refresh
                  tokens for that client/user pair.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl -X POST ${base}/api/oauth/token \\
  -d "grant_type=refresh_token" \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "refresh_token=STORED_REFRESH_TOKEN"

# Always store the NEW refresh_token from the response.
# Using an old (rotated) token invalidates the entire grant.`,
                    },
                    {
                      label: "Node.js",
                      code: `const tokens = await fetch('${base}/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: 'app_xxx',
    client_secret: 'sec_xxx',
    refresh_token: storedRefreshToken,
  }),
}).then(r => r.json());

// Persist the NEW refresh token; the old one is now invalid.
storedRefreshToken = tokens.refresh_token;`,
                    },
                    {
                      label: "Python",
                      code: `import requests

res = requests.post('${base}/api/oauth/token', data={
  'grant_type': 'refresh_token',
  'client_id': 'app_xxx',
  'client_secret': 'sec_xxx',
  'refresh_token': stored_refresh_token,
})
tokens = res.json()
# persist tokens['refresh_token']; the old one is now invalid`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="userinfo" index="10.0" title="userinfo">
                <p>
                  returns claims about the authenticated user. pass the access
                  token as a bearer header. claims included depend on the
                  scopes that were granted.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl ${base}/api/oauth/userinfo \\
  -H "Authorization: Bearer ACCESS_TOKEN"`,
                    },
                    {
                      label: "Node.js",
                      code: `const profile = await fetch('${base}/api/oauth/userinfo', {
  headers: { Authorization: \`Bearer \${accessToken}\` },
}).then(r => r.json());
// profile.sub, profile.email, profile.subscriptions, ...`,
                    },
                    {
                      label: "Python",
                      code: `import requests

profile = requests.get(
  '${base}/api/oauth/userinfo',
  headers={'Authorization': f'Bearer {access_token}'},
).json()`,
                    },
                    {
                      label: "Response",
                      code: `// Always present:
{
  "sub": "usr_...",           // stable user public ID
  "id": "usr_...",            // alias for sub

  // profile scope:
  "username": "alex",
  "preferred_username": "alex",
  "name": "Alex",
  "firstName": "Alex",
  "bio": "...",

  // email scope:
  "email": "alex@example.com",
  "email_verified": true,

  // birthdate scope:
  "birthdate": "1990-05-15",

  // subscription:read scope:
  "subscriptions": [
    { "product": "pro", "status": "active", "expiresAt": "2026-01-01T00:00:00Z" }
  ]
}`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="introspect" index="11.0" title="token introspection (rfc 7662)">
                <p>
                  check whether a token is currently active. only confidential
                  clients can call this endpoint. revoked, expired, or unknown
                  tokens return <code>{`{ "active": false }`}</code>.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl -X POST ${base}/api/oauth/introspect \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "token=ACCESS_OR_REFRESH_TOKEN"`,
                    },
                    {
                      label: "Node.js",
                      code: `const intro = await fetch('${base}/api/oauth/introspect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: 'app_xxx',
    client_secret: 'sec_xxx',
    token: 'ACCESS_OR_REFRESH_TOKEN',
  }),
}).then(r => r.json());

if (intro.active) {
  // intro.sub, intro.scope, intro.exp, intro.client_id
}`,
                    },
                    {
                      label: "Python",
                      code: `import requests

intro = requests.post('${base}/api/oauth/introspect', data={
  'client_id': 'app_xxx',
  'client_secret': 'sec_xxx',
  'token': 'ACCESS_OR_REFRESH_TOKEN',
}).json()

if intro['active']:
  # intro['sub'], intro['scope'], intro['exp']`,
                    },
                    {
                      label: "Response",
                      code: `// Active token:
{
  "active": true,
  "client_id": "app_xxx",
  "sub": "usr_...",
  "scope": "openid profile email",
  "exp": 1720000000        // Unix timestamp
}

// Inactive / unknown token:
{ "active": false }`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="revoke" index="12.0" title="token revocation (rfc 7009)">
                <p>
                  revoke an access or refresh token immediately. revoking a
                  refresh token also invalidates all access tokens issued from
                  it.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl -X POST ${base}/api/oauth/revoke \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "token=TOKEN_TO_REVOKE"`,
                    },
                    {
                      label: "Node.js",
                      code: `await fetch('${base}/api/oauth/revoke', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: 'app_xxx',
    client_secret: 'sec_xxx',
    token: 'TOKEN_TO_REVOKE',
  }),
});`,
                    },
                    {
                      label: "Python",
                      code: `import requests

requests.post('${base}/api/oauth/revoke', data={
  'client_id': 'app_xxx',
  'client_secret': 'sec_xxx',
  'token': 'TOKEN_TO_REVOKE',
})`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="jwks" index="13.0" title="jwks and id token verification">
                <p>
                  access tokens and id tokens are rs256-signed jwts. the public
                  signing keys are available at the jwks endpoint.
                </p>
                <CodeTabs
                  tabs={[
                    { label: "cURL", code: `curl ${base}/oauth/jwks` },
                    {
                      label: "Node.js",
                      code: `import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('${base}/oauth/jwks')
);

const { payload } = await jwtVerify(accessToken, JWKS, {
  issuer: '${base}',
  algorithms: ['RS256'],
});
// payload.sub is the user's stable public ID`,
                    },
                    {
                      label: "Python",
                      code: `import requests
from jose import jwt

jwks = requests.get('${base}/oauth/jwks').json()

claims = jwt.decode(
  token,
  jwks,
  algorithms=['RS256'],
  issuer='${base}',
)`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="bearer" index="14.0" title="bearer key system">
                <p>
                  the bearer key system provides server-to-server api access
                  without a user session. a bearer key is a long-lived secret
                  tied to an external app registered in the system.
                </p>

                <h3 className="text-meta uppercase tracking-wider text-accent mt-6 mb-2">
                  &gt; requesting a key
                </h3>
                <p>
                  visit{" "}
                  <a
                    href="/request-bearer"
                    className="text-accent hover:text-fg transition-colors"
                  >
                    /request-bearer
                  </a>{" "}
                  and describe your application. an admin reviews and approves
                  the request via telegram. once approved, the plaintext key is
                  available once from your dashboard.
                </p>

                <h3 className="text-meta uppercase tracking-wider text-accent mt-6 mb-2">
                  &gt; using the key
                </h3>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl -X POST ${base}/api/activation-requests \\
  -H "Authorization: Bearer YOUR_BEARER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "scopes": ["profile:read", "email:read"], "returnUrl": "https://yourapp.example/done" }'`,
                    },
                    {
                      label: "Node.js",
                      code: `const res = await fetch('${base}/api/activation-requests', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${process.env.BOTTLENECK_BEARER_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    scopes: ['profile:read', 'email:read'],
    returnUrl: 'https://yourapp.example/done',
  }),
});
const { id, activationUrl } = await res.json();
// redirect your user to activationUrl`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="activation" index="15.0" title="activation flow">
                <p>
                  activations are the mechanism by which an external app links
                  a bottleneck user to its own system. the flow is user-driven:
                  your server creates an activation request, the user approves
                  it on bottleneck, and your server polls for the result.
                </p>

                <h3 className="text-meta uppercase tracking-wider text-accent mt-6 mb-2">
                  &gt; step 1 — create request
                </h3>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl -X POST ${base}/api/activation-requests \\
  -H "Authorization: Bearer YOUR_BEARER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "scopes": ["profile:read", "email:read"],
    "requestedSubject": "optional-your-internal-user-id",
    "returnUrl": "https://yourapp.example/done",
    "callbackUrl": "https://yourapp.example/webhook"
  }'

# Response:
# {
#   "id": "act_...",
#   "token": "...",
#   "activationUrl": "${base}/activate?token=...",
#   "expiresAt": "2026-01-01T00:00:00Z"
# }`,
                    },
                    {
                      label: "Node.js",
                      code: `const res = await fetch('${base}/api/activation-requests', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${process.env.BOTTLENECK_BEARER_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    scopes: ['profile:read', 'email:read'],
    requestedSubject: 'your-internal-user-id',
    returnUrl: 'https://yourapp.example/done',
    callbackUrl: 'https://yourapp.example/webhook',
  }),
}).then(r => r.json());

// redirect the user to res.activationUrl`,
                    },
                    {
                      label: "Python",
                      code: `import os, requests

res = requests.post('${base}/api/activation-requests',
  headers={
    'Authorization': f"Bearer {os.environ['BOTTLENECK_BEARER_KEY']}",
  },
  json={
    'scopes': ['profile:read', 'email:read'],
    'requestedSubject': 'your-internal-user-id',
    'returnUrl': 'https://yourapp.example/done',
    'callbackUrl': 'https://yourapp.example/webhook',
  },
).json()

# redirect the user to res['activationUrl']`,
                    },
                  ]}
                />

                <h3 className="text-meta uppercase tracking-wider text-accent mt-6 mb-2">
                  &gt; step 2 — redirect your user
                </h3>
                <p>
                  send your user to the <code>activationUrl</code>. they see a
                  consent screen listing the requested scopes.
                </p>

                <h3 className="text-meta uppercase tracking-wider text-accent mt-6 mb-2">
                  &gt; step 3 — poll for result
                </h3>
                <CodeTabs
                  tabs={[
                    {
                      label: "cURL",
                      code: `curl ${base}/api/activation-requests/ACT_ID \\
  -H "Authorization: Bearer YOUR_BEARER_KEY"`,
                    },
                    {
                      label: "Node.js",
                      code: `const result = await fetch(
  \`${base}/api/activation-requests/\${id}\`,
  {
    headers: {
      Authorization: \`Bearer \${process.env.BOTTLENECK_BEARER_KEY}\`,
    },
  },
).then(r => r.json());

if (result.status === 'approved') {
  // result.approvedUserId, result.profile.email, ...
}`,
                    },
                    {
                      label: "Python",
                      code: `import os, requests

result = requests.get(
  f"${base}/api/activation-requests/{id}",
  headers={'Authorization': f"Bearer {os.environ['BOTTLENECK_BEARER_KEY']}"},
).json()

if result['status'] == 'approved':
  # result['approvedUserId'], result['profile']['email']`,
                    },
                  ]}
                />

                <p>
                  possible statuses: <code>pending</code>, <code>approved</code>
                  , <code>denied</code>, <code>expired</code>,{" "}
                  <code>cancelled</code>.
                </p>
              </DocSection>

              <DocSection id="errors" index="16.0" title="error responses">
                <p>
                  all api errors follow the oauth 2.0 error format. http status
                  codes: 400 for client errors, 401 for authentication
                  failures, 403 for forbidden, 429 for rate limiting.
                </p>
                <CodeTabs
                  tabs={[
                    {
                      label: "Format",
                      code: `{
  "error": "invalid_grant",
  "error_description": "authorization code is invalid"
}

// Common error codes:
// invalid_request      - missing or malformed parameter
// invalid_client       - client authentication failed
// invalid_grant        - code, refresh token, or device code is invalid/expired
// invalid_scope        - unknown or disallowed scope
// access_denied        - user denied or subscription required
// server_error         - unexpected server error
// authorization_pending - device grant: user hasn't approved yet
// expired_token        - device grant: code expired`,
                    },
                  ]}
                />
              </DocSection>

              <DocSection id="lifetimes" index="17.0" title="token lifetimes">
                <DataGrid
                  cols="200px 120px 1fr"
                  headers={["type", "ttl", "note"]}
                  rows={[
                    ["authorization code", "10 minutes", "single use"],
                    ["access token", "15 minutes", "JWT, RS256"],
                    ["refresh token", "30 days", "rotates on use"],
                    ["ID token", "15 minutes", "JWT, RS256, openid scope only"],
                    ["device code", "10 minutes", "poll every interval seconds"],
                    ["PAR request_uri", "60 seconds", "single use"],
                  ]}
                  middleTone="accent"
                />
              </DocSection>

              <DocSection id="scopes" index="18.0" title="scopes">
                <p>
                  legacy aliases are accepted for backwards compatibility but
                  the canonical names below are preferred.
                </p>
                <DataGrid
                  cols="140px 130px 1fr"
                  headers={["scope", "legacy alias", "details"]}
                  rows={[
                    ["openid", "profile:read", "returns an OIDC ID token with the access token"],
                    ["profile", "profile:read", "name, username, bio"],
                    ["email", "email:read", "email address and verification status"],
                    ["birthdate", "dob:read", "date of birth"],
                    ["subscription:read", "", "active subscriptions (product, status, expiresAt)"],
                  ]}
                />
              </DocSection>

              <DocSection id="endpoints" index="19.0" title="endpoints">
                <DataGrid
                  cols="56px 290px 1fr"
                  headers={["method", "path", "description"]}
                  rows={[
                    ["GET", "/.well-known/openid-configuration", "OIDC discovery metadata"],
                    ["GET", "/.well-known/oauth-authorization-server", "OAuth 2.0 server metadata"],
                    ["POST", "/api/oauth/register", "dynamic client registration"],
                    ["POST", "/api/oauth/par", "pushed authorization requests"],
                    ["POST", "/api/oauth/device/code", "device authorization grant initiation"],
                    ["GET", "/oauth/authorize", "browser authorization and consent"],
                    ["POST", "/api/oauth/token", "code exchange, device polling, and refresh"],
                    ["GET", "/api/oauth/userinfo", "profile claims for access tokens"],
                    ["POST", "/api/oauth/introspect", "token status (confidential clients only)"],
                    ["POST", "/api/oauth/revoke", "access or refresh token revocation"],
                    ["GET", "/oauth/jwks", "RS256 public signing keys"],
                    ["POST", "/api/activation-requests", "create activation request (bearer key)"],
                    ["GET", "/api/activation-requests/:id", "poll activation status (bearer key)"],
                    ["POST", "/api/activation-requests/:id/cancel", "cancel activation (bearer key)"],
                  ]}
                  firstTone="accent"
                />
              </DocSection>
            </article>

            <aside className="sticky top-16">
              <div className="text-meta uppercase tracking-wider text-faint mb-3 flex items-baseline gap-2">
                <span className="text-accent">$</span>
                <span>contents</span>
              </div>
              <nav className="space-y-0 border-t border-rule">
                {[
                  ["#discovery", "1.0", "discovery"],
                  ["#dcr", "2.0", "client registration"],
                  ["#pkce", "3.0", "pkce requirement"],
                  ["#authorize", "4.0", "standard authorize"],
                  ["#par", "5.0", "par"],
                  ["#device", "6.0", "device grant"],
                  ["#client-credentials", "7.0", "client credentials"],
                  ["#token", "8.0", "token exchange"],
                  ["#refresh", "9.0", "refresh tokens"],
                  ["#userinfo", "10.0", "userinfo"],
                  ["#introspect", "11.0", "introspection"],
                  ["#revoke", "12.0", "revocation"],
                  ["#jwks", "13.0", "jwks / id tokens"],
                  ["#bearer", "14.0", "bearer key system"],
                  ["#activation", "15.0", "activation flow"],
                  ["#errors", "16.0", "error responses"],
                  ["#lifetimes", "17.0", "token lifetimes"],
                  ["#scopes", "18.0", "scopes"],
                  ["#endpoints", "19.0", "endpoints"],
                ].map(([href, index, label]) => (
                  <a
                    key={href}
                    href={href}
                    className="grid grid-cols-[32px_1fr] gap-2 h-7 leading-7 text-meta border-b border-rule text-secondary hover:text-accent transition-colors"
                  >
                    <span className="text-faint tabular-nums">{index}</span>
                    <span>{label}</span>
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
  index,
  children,
}: {
  id: string;
  title: string;
  index: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-16">
      <header className="flex items-baseline gap-3 mb-4 pb-2 border-b border-rule">
        <span className="text-meta text-faint tabular-nums shrink-0">
          {index}
        </span>
        <h2 className="text-[16px] uppercase tracking-wider text-fg">
          {title}
        </h2>
      </header>
      <div className="space-y-4 text-meta leading-6 text-secondary">
        {children}
      </div>
    </section>
  );
}

function DataGrid({
  cols,
  headers,
  rows,
  firstTone,
  middleTone,
}: {
  cols: string;
  headers: string[];
  rows: string[][];
  firstTone?: "accent";
  middleTone?: "accent";
}) {
  return (
    <div className="border-t border-rule">
      <div
        className="grid gap-3 px-1 py-2 text-meta uppercase tracking-wider text-faint border-b border-rule"
        style={{ gridTemplateColumns: cols }}
      >
        {headers.map(h => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid gap-3 px-1 py-2.5 text-meta items-baseline border-b border-rule"
          style={{ gridTemplateColumns: cols }}
        >
          {row.map((cell, j) => {
            const isFirst = j === 0;
            const isMiddle = j === 1;
            let toneClass = "text-fg";
            if (j === row.length - 1) toneClass = "text-muted";
            if (isFirst && firstTone === "accent") toneClass = "text-accent";
            if (isMiddle && middleTone === "accent") toneClass = "text-accent tabular-nums";
            if (isMiddle && !middleTone) toneClass = "text-faint";
            return (
              <span key={j} className={`${toneClass} break-all`}>
                {cell}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

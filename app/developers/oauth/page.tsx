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
      <Sidebar user={{ name: current.user.firstName, username: current.user.username }} />
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
              Bottleneck acts as an authorization server for your applications. It supports OAuth 2.1
              with PKCE, OpenID Connect, Pushed Authorization Requests, Device Authorization Grant,
              Dynamic Client Registration, and a proprietary Bearer Key system for server-to-server access.
            </p>
          </header>

          <div className="grid lg:grid-cols-[1fr_240px] gap-6 items-start">
            <article className="border border-border bg-surface rounded-sm overflow-hidden">

              <DocSection id="discovery" title="discovery">
                <p>
                  The server publishes a standard OIDC discovery document. Point any OIDC-compatible
                  library here and all endpoint URLs, signing key locations, and supported features
                  are resolved automatically.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl ${base}/.well-known/openid-configuration`
                  }
                ]} />
                <p>
                  The OAuth 2.0 authorization server metadata is also available at{" "}
                  <code>{base}/.well-known/oauth-authorization-server</code>.
                </p>
              </DocSection>

              <DocSection id="dcr" title="dynamic client registration (rfc 7591)">
                <p>
                  Register a client programmatically. This endpoint is rate-limited (5 registrations
                  per hour per IP). The <code>client_id</code> and <code>client_secret</code> in the
                  response are your long-term credentials — store <code>client_secret</code> securely.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl -X POST ${base}/api/oauth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_name": "My App",
    "redirect_uris": ["https://yourapp.example/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "token_endpoint_auth_method": "client_secret_post"
  }'`
                  },
                  {
                    label: "Node.js",
                    code: `const res = await fetch('${base}/api/oauth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'My App',
    redirect_uris: ['https://yourapp.example/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
  })
});
const { client_id, client_secret } = await res.json();`
                  },
                  {
                    label: "Python",
                    code: `import requests

res = requests.post('${base}/api/oauth/register', json={
  'client_name': 'My App',
  'redirect_uris': ['https://yourapp.example/callback'],
  'grant_types': ['authorization_code', 'refresh_token'],
})
data = res.json()
client_id = data['client_id']
client_secret = data['client_secret']`
                  }
                ]} />
              </DocSection>

              <DocSection id="pkce" title="pkce requirement">
                <p>
                  <strong className="text-fg">PKCE S256 is mandatory on every authorization request.</strong>{" "}
                  The server rejects any code exchange that omits <code>code_verifier</code> or uses
                  the <code>plain</code> method. Generate a cryptographically random verifier and
                  derive the challenge before sending the user to the authorization endpoint.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "Node.js",
                    code: `import { randomBytes, createHash } from 'crypto';

const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256')
  .update(verifier)
  .digest('base64url');

// verifier  → store securely, send at token exchange
// challenge → send in the authorization request`
                  },
                  {
                    label: "Python",
                    code: `import secrets, hashlib, base64

verifier = secrets.token_urlsafe(48)
digest = hashlib.sha256(verifier.encode()).digest()
challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode()

# verifier  -> store securely, send at token exchange
# challenge -> send in the authorization request`
                  }
                ]} />
              </DocSection>

              <DocSection id="authorize" title="standard authorization">
                <p>
                  Redirect the user&apos;s browser to the authorization endpoint. Include{" "}
                  <code>code_challenge</code> and <code>code_challenge_method=S256</code> (required).
                  Use <code>state</code> to prevent CSRF in your callback handler.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "URL",
                    code: `${base}/oauth/authorize
  ?response_type=code
  &client_id=app_xxx
  &redirect_uri=https%3A%2F%2Fyourapp.example%2Fcallback
  &scope=openid%20profile%20email
  &state=random_csrf_token
  &code_challenge=BASE64URL_SHA256_OF_VERIFIER
  &code_challenge_method=S256`
                  }
                ]} />
              </DocSection>

              <DocSection id="par" title="pushed authorization requests (rfc 9126)">
                <p>
                  PAR lets confidential clients push the full authorization payload directly to the
                  server before the redirect. The response is a short-lived <code>request_uri</code>{" "}
                  you use in place of inline query parameters. This keeps authorization URLs clean
                  and prevents parameter tampering.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `# Step 1 — push the request
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

# Step 2 — redirect the user
# ${base}/oauth/authorize?client_id=app_xxx&request_uri=urn%3A...`
                  }
                ]} />
              </DocSection>

              <DocSection id="device" title="device authorization grant (rfc 8628)">
                <p>
                  For headless devices (CLIs, smart TVs, embedded systems) that cannot open a browser.
                  The device displays a short user code; the user approves it on a separate device.
                  Poll the token endpoint using the returned <code>interval</code>.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `# Step 1 — request a device code
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

# Step 2 — show the user_code, then poll every {interval} seconds
curl -X POST ${base}/api/oauth/token \\
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \\
  -d "client_id=app_xxx" \\
  -d "device_code=DEVICE_CODE_FROM_STEP_1"

# Errors while waiting: authorization_pending | slow_down | expired_token | access_denied`
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
});`
                  }
                ]} />
              </DocSection>

              <DocSection id="client-credentials" title="client credentials grant">
                <p>
                  For machine-to-machine flows where no user is involved. The client authenticates
                  directly with its credentials. The resulting access token carries no user context —{" "}
                  <code>sub</code> is the app&apos;s public ID.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl -X POST ${base}/api/oauth/token \\
  -d "grant_type=client_credentials" \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx"`
                  }
                ]} />
              </DocSection>

              <DocSection id="token" title="token exchange">
                <p>
                  Exchange the authorization code for tokens. Include the <code>code_verifier</code>{" "}
                  that matches the <code>code_challenge</code> from the authorization request.
                  The response includes an access token, a refresh token, and — when the{" "}
                  <code>openid</code> scope was granted — an ID token.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl -X POST ${base}/api/oauth/token \\
  -d "grant_type=authorization_code" \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "code=RETURNED_CODE" \\
  -d "redirect_uri=https://yourapp.example/callback" \\
  -d "code_verifier=YOUR_PKCE_VERIFIER"`
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

// {
//   "access_token": "eyJ...",
//   "token_type": "Bearer",
//   "expires_in": 3600,
//   "refresh_token": "...",
//   "id_token": "eyJ...",   // only when openid scope was granted
//   "scope": "openid profile email"
// }
const tokens = await res.json();`
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
tokens = res.json()`
                  }
                ]} />
              </DocSection>

              <DocSection id="refresh" title="refresh tokens">
                <p>
                  Refresh tokens rotate on every use — the server returns a new refresh token with
                  each response.{" "}
                  <strong className="text-fg">Always replace your stored refresh token with the new one.</strong>{" "}
                  Replaying a consumed refresh token is treated as a compromise signal: the server
                  immediately revokes all access and refresh tokens for that client/user pair.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl -X POST ${base}/api/oauth/token \\
  -d "grant_type=refresh_token" \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "refresh_token=STORED_REFRESH_TOKEN"

# Always store the NEW refresh_token from the response.
# Using an old (rotated) token invalidates the entire grant.`
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
# persist tokens['refresh_token'] — the old one is now invalid`
                  }
                ]} />
              </DocSection>

              <DocSection id="userinfo" title="userinfo">
                <p>
                  Returns claims about the authenticated user. Pass the access token as a Bearer
                  header. Claims included depend on the scopes that were granted.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl ${base}/api/oauth/userinfo \\
  -H "Authorization: Bearer ACCESS_TOKEN"`
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
}`
                  }
                ]} />
              </DocSection>

              <DocSection id="introspect" title="token introspection (rfc 7662)">
                <p>
                  Check whether a token is currently active. Only confidential clients (those with
                  a <code>client_secret</code>) can call this endpoint. Revoked, expired, or unknown
                  tokens return <code>{`{ "active": false }`}</code>.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl -X POST ${base}/api/oauth/introspect \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "token=ACCESS_OR_REFRESH_TOKEN"`
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
{ "active": false }`
                  }
                ]} />
              </DocSection>

              <DocSection id="revoke" title="token revocation (rfc 7009)">
                <p>
                  Revoke an access or refresh token immediately. Revoking a refresh token also
                  invalidates all access tokens issued from it.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl -X POST ${base}/api/oauth/revoke \\
  -d "client_id=app_xxx" \\
  -d "client_secret=sec_xxx" \\
  -d "token=TOKEN_TO_REVOKE"`
                  }
                ]} />
              </DocSection>

              <DocSection id="jwks" title="jwks and id token verification">
                <p>
                  Access tokens and ID tokens are RS256-signed JWTs. The public signing keys are
                  available at the JWKS endpoint. Use any standard JWT library to verify signatures
                  locally without calling the server.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl ${base}/oauth/jwks`
                  },
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
// payload.sub is the user's stable public ID`
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
)`
                  }
                ]} />
                <p>
                  ID token claims mirror the userinfo response. Standard OIDC claims (<code>iss</code>,{" "}
                  <code>aud</code>, <code>exp</code>, <code>iat</code>, <code>sub</code>) are always
                  present. Profile, email, and birthdate claims are included when the corresponding
                  scope was granted.
                </p>
              </DocSection>

              <DocSection id="bearer" title="bearer key system">
                <p>
                  The Bearer Key system provides server-to-server API access without a user session.
                  A Bearer Key is a long-lived secret tied to an external app registered in the system.
                  It is used for the{" "}
                  <a href="#activation" className="text-secondary hover:text-fg underline underline-offset-2">
                    Activation flow
                  </a>{" "}
                  and any other server-side calls to the Bottleneck API.
                </p>

                <h3 className="text-[12px] uppercase tracking-wider text-faint mt-4 mb-2">requesting a key</h3>
                <p>
                  Visit <a href="/request-bearer" className="text-secondary hover:text-fg underline underline-offset-2">/request-bearer</a> and
                  describe your application. An admin reviews and approves the request via Telegram.
                  Once approved, the plaintext key is available once from your dashboard — copy it
                  immediately. Only a SHA-256 hash is retained afterward.
                </p>

                <h3 className="text-[12px] uppercase tracking-wider text-faint mt-4 mb-2">using the key</h3>
                <p>
                  Send the key as a standard Bearer token in the <code>Authorization</code> header
                  on all server-to-server requests.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl -X POST ${base}/api/activation-requests \\
  -H "Authorization: Bearer YOUR_BEARER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "scopes": ["profile:read", "email:read"], "returnUrl": "https://yourapp.example/done" }'`
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
// redirect your user to activationUrl`
                  }
                ]} />
              </DocSection>

              <DocSection id="activation" title="activation flow">
                <p>
                  Activations are the mechanism by which an external app links a Bottleneck user
                  to its own system and obtains permission to read their data. The flow is user-driven:
                  your server creates an activation request, the user approves it on Bottleneck, and
                  your server polls for the result.
                </p>

                <h3 className="text-[12px] uppercase tracking-wider text-faint mt-4 mb-2">step 1 — create request</h3>
                <CodeTabs tabs={[
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
# }`
                  }
                ]} />

                <h3 className="text-[12px] uppercase tracking-wider text-faint mt-4 mb-2">step 2 — redirect your user</h3>
                <p>
                  Send your user to the <code>activationUrl</code>. They see a consent screen listing
                  the requested scopes. If a subscription is required by your app, Bottleneck checks
                  that the user holds one before allowing approval.
                </p>

                <h3 className="text-[12px] uppercase tracking-wider text-faint mt-4 mb-2">step 3 — poll for result</h3>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl ${base}/api/activation-requests/ACT_ID \\
  -H "Authorization: Bearer YOUR_BEARER_KEY"

# Response when approved:
# {
#   "id": "act_...",
#   "status": "approved",
#   "approvedUserId": "usr_...",
#   "expiresAt": "...",
#   "profile": {
#     "id": "usr_...",
#     "firstName": "Alex",
#     "username": "alex",
#     "bio": "...",
#     "email": "alex@example.com",   // null if email:read not granted
#     "dob": null                    // null if dob:read not granted
#   }
# }`
                  }
                ]} />

                <h3 className="text-[12px] uppercase tracking-wider text-faint mt-4 mb-2">cancel a request</h3>
                <CodeTabs tabs={[
                  {
                    label: "cURL",
                    code: `curl -X POST ${base}/api/activation-requests/ACT_ID/cancel \\
  -H "Authorization: Bearer YOUR_BEARER_KEY"`
                  }
                ]} />

                <p>
                  Possible statuses: <code>pending</code>, <code>approved</code>,{" "}
                  <code>denied</code>, <code>expired</code>, <code>cancelled</code>.
                </p>
              </DocSection>

              <DocSection id="errors" title="error responses">
                <p>
                  All API errors follow the OAuth 2.0 error format. HTTP status codes:
                  400 for client errors, 401 for authentication failures, 403 for forbidden,
                  429 for rate limiting.
                </p>
                <CodeTabs tabs={[
                  {
                    label: "Format",
                    code: `{
  "error": "invalid_grant",
  "error_description": "authorization code is invalid"
}

// Common error codes:
// invalid_request      — missing or malformed parameter
// invalid_client       — client authentication failed
// invalid_grant        — code, refresh token, or device code is invalid/expired
// invalid_scope        — unknown or disallowed scope
// access_denied        — user denied or subscription required
// server_error         — unexpected server error
// authorization_pending — device grant: user hasn't approved yet
// expired_token        — device grant: code expired`
                  }
                ]} />
              </DocSection>

              <DocSection id="lifetimes" title="token lifetimes">
                <div className="divide-y divide-border border border-border rounded-sm">
                  {[
                    ["authorization code", "10 minutes", "single use"],
                    ["access token", "1 hour", "JWT, RS256"],
                    ["refresh token", "30 days", "rotates on use"],
                    ["ID token", "1 hour", "JWT, RS256, openid scope only"],
                    ["device code", "10 minutes", "poll every interval seconds"],
                    ["PAR request_uri", "60 seconds", "single use"],
                  ].map(([type, ttl, note]) => (
                    <div key={type} className="grid sm:grid-cols-[200px_120px_1fr] gap-3 px-3 py-2.5 text-[13px]">
                      <span className="text-fg font-mono text-[12px]">{type}</span>
                      <span className="text-warning tabular-nums">{ttl}</span>
                      <span className="text-muted">{note}</span>
                    </div>
                  ))}
                </div>
              </DocSection>

              <DocSection id="scopes" title="scopes">
                <p>
                  Legacy aliases (<code>profile:read</code>, <code>email:read</code>,{" "}
                  <code>dob:read</code>) are accepted for backwards compatibility but the canonical
                  names below are preferred.
                </p>
                <div className="divide-y divide-border border border-border rounded-sm">
                  {[
                    ["openid", "profile:read", "returns an OIDC ID token with the access token"],
                    ["profile", "profile:read", "name, username, bio"],
                    ["email", "email:read", "email address and verification status"],
                    ["birthdate", "dob:read", "date of birth"],
                    ["subscription:read", "", "active subscriptions (product, status, expiresAt)"],
                  ].map(([scope, alias, detail]) => (
                    <div key={scope} className="grid sm:grid-cols-[140px_130px_1fr] gap-3 px-3 py-2.5 text-[13px]">
                      <span className="text-fg font-mono text-[12px]">{scope}</span>
                      <span className="text-faint font-mono text-[12px]">{alias}</span>
                      <span className="text-muted">{detail}</span>
                    </div>
                  ))}
                </div>
              </DocSection>

              <DocSection id="endpoints" title="endpoints">
                <div className="divide-y divide-border border border-border rounded-sm">
                  {[
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
                  ].map(([method, path, detail]) => (
                    <div key={path} className="grid sm:grid-cols-[44px_280px_1fr] gap-3 px-3 py-2.5 text-[13px] items-baseline">
                      <span className="text-faint font-mono text-[11px]">{method}</span>
                      <span className="text-fg font-mono text-[12px] break-all">{path}</span>
                      <span className="text-muted">{detail}</span>
                    </div>
                  ))}
                </div>
              </DocSection>

            </article>

            <aside className="border border-border bg-surface rounded-sm p-4 sticky top-16">
              <div className="text-micro uppercase text-faint mb-3">on this page</div>
              <nav className="space-y-0.5 text-[13px]">
                {[
                  ["#discovery", "discovery"],
                  ["#dcr", "client registration"],
                  ["#pkce", "pkce requirement"],
                  ["#authorize", "standard authorize"],
                  ["#par", "par"],
                  ["#device", "device grant"],
                  ["#client-credentials", "client credentials"],
                  ["#token", "token exchange"],
                  ["#refresh", "refresh tokens"],
                  ["#userinfo", "userinfo"],
                  ["#introspect", "introspection"],
                  ["#revoke", "revocation"],
                  ["#jwks", "jwks / id tokens"],
                  ["#bearer", "bearer key system"],
                  ["#activation", "activation flow"],
                  ["#errors", "error responses"],
                  ["#lifetimes", "token lifetimes"],
                  ["#scopes", "scopes"],
                  ["#endpoints", "endpoints"],
                ].map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    className="block px-2 py-1 leading-snug rounded-sm text-secondary hover:text-fg hover:bg-hover transition-colors"
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
      <h2 className="text-micro uppercase tracking-[0.08em] text-muted mb-3">{title}</h2>
      <div className="space-y-4 text-[13px] leading-6 text-secondary">{children}</div>
    </section>
  );
}

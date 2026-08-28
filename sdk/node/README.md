# @bottleneck/auth-sdk

Server-side SDK for Bottleneck Auth. Covers the activation broker flow, OAuth 2.1 + PKCE, and webhook verification.

```sh
npm install @bottleneck/auth-sdk
```

Requires Node.js 18.17+. Zero runtime dependencies.

## Client setup

```ts
import { BottleneckAuthClient } from "@bottleneck/auth-sdk";

const auth = new BottleneckAuthClient({
  issuer: "https://auth.bneck.com",
  clientId: process.env.BOTTLENECK_CLIENT_ID,
  clientSecret: process.env.BOTTLENECK_CLIENT_SECRET,
});
```

Options:

- `tokenEndpointAuthMethod`: `"client_secret_post"` (default when a secret is
  configured — this matches apps created through the developer dashboard),
  `"client_secret_basic"`, or `"none"` (default for public clients without a
  secret). Must match the app's registered method; the server rejects a
  mismatch with `invalid_client`.
- `fetch`: substitute fetch implementation.
- `timeoutMs`: default per-request timeout (30000; `0` disables).

Every network method also accepts a trailing options argument:
`{ signal?: AbortSignal, timeoutMs?: number }`.

## Activation broker

Use when your app wants Bottleneck to authenticate a user once and return a short-lived activation result. The user clicks through Bottleneck, you poll for status.

```ts
import { randomUUID } from "node:crypto";

const apiKey = process.env.BOTTLENECK_AUTH_API_KEY!;

const created = await auth.createActivationRequest({
  apiKey,
  requestedSubject: "local-user-42",
  scopes: ["profile:read", "email:read"],
  returnUrl: "https://app.example.com/auth/return",
  // Safe to retry the create on a network error: the same key (8-255 chars)
  // returns the original response instead of minting a duplicate request.
  idempotencyKey: randomUUID(),
});

// Redirect the user to created.activationUrl, then poll:
const status = await auth.getActivationStatus({ apiKey, id: created.id });
if (status.status === "approved" && !status.revoked && status.profile) {
  // status.profile.id, status.profile.email, etc.
}
```

`profile` is always present in the response. It is `null` for any status other than `approved`, and individual fields may be `null` if the user unchecked the corresponding scope during approval. An approved activation can later be revoked: `revoked` flips to `true` and `profile` becomes `null`, so check `revoked` before trusting an old approval.

The rest of the activation lifecycle:

```ts
// Cancel a request the user has abandoned.
await auth.cancelActivationRequest({ apiKey, id: created.id });

// Revoke the standing grant behind an approved activation.
await auth.revokeActivation({ apiKey, id: created.id });

// Validate your redirect allowlist and scopes before sending users in.
const config = await auth.getAppConfig({ apiKey });

// Look up recent requests for a subject, or spot-check authorizations.
const { requests } = await auth.listActivationRequests({ apiKey, subject: "local-user-42" });
const { authorizations } = await auth.listAuthorizations({ apiKey });
```

Both list endpoints return only the most recent rows (50 requests, 200
authorizations) and have no pagination yet, so treat them as a recent-activity
view: absence from the list is not evidence that a request or grant is gone.
Keep your own records (or the webhook feed) as the source of truth for
reconciliation.

## OAuth 2.1 + PKCE

Use when you want a standard OAuth Authorization Code + PKCE flow with access and refresh tokens. The current OAuth profile is `bn-oauth-2026-05`.

Start the flow by generating PKCE values and a `state`, storing both in the
user's session, and redirecting:

```ts
import { randomBytes } from "node:crypto";

app.get("/oauth/start", (req, res) => {
  const pkce = auth.generatePkcePair();
  const state = randomBytes(16).toString("base64url");

  // Both values must survive until the callback, tied to this browser session.
  req.session.oauth = { state, codeVerifier: pkce.codeVerifier };

  res.redirect(
    auth.buildAuthorizationUrl({
      clientId: process.env.BOTTLENECK_CLIENT_ID!,
      redirectUri: "https://app.example.com/oauth/callback",
      scope: "openid profile email",
      state,
      codeChallenge: pkce.codeChallenge,
    }),
  );
});
```

On the callback, validate `state` against the session before exchanging the
code. Skipping this check lets an attacker complete the flow with their own
authorization code in the victim's session (login CSRF):

```ts
app.get("/oauth/callback", async (req, res) => {
  const stored = req.session.oauth;
  req.session.oauth = undefined; // single use, replay is not allowed

  if (!stored || !req.query.state || req.query.state !== stored.state) {
    return res.status(400).send("state mismatch");
  }

  const tokens = await auth.exchangeCode({
    code: req.query.code as string,
    redirectUri: "https://app.example.com/oauth/callback",
    codeVerifier: stored.codeVerifier,
  });

  const user = await auth.userinfo(tokens.access_token);
  // ...establish your own session...
});
```

Token lifecycle:

```ts
// Refresh when the access token expires.
const refreshed = await auth.refreshToken({ refreshToken: tokens.refresh_token! });

// Revoke on logout or when discarding stored tokens. Revoking a refresh
// token also revokes the access tokens issued from it.
await auth.revokeToken({ token: tokens.refresh_token!, tokenTypeHint: "refresh_token" });

// Machine-to-machine access without a user.
const appToken = await auth.clientCredentialsGrant({ scope: "profile:read" });
```

## Token introspection

```ts
const result = await auth.introspect(tokens.access_token);
if (!result.active) {
  // Token has been revoked or expired.
}
```

## Webhook signature verification

For inbound webhooks signed by Bottleneck. Verification covers authenticity
(HMAC) and freshness: deliveries with a timestamp more than five minutes from
your clock are rejected as replays. Tune the window with `toleranceSeconds`.

```ts
import { verifyWebhookSignature } from "@bottleneck/auth-sdk";

const ok = verifyWebhookSignature({
  secret: process.env.BOTTLENECK_WEBHOOK_SECRET!,
  timestamp: req.headers["x-bottleneck-timestamp"] as string,
  body: rawRequestBody,
  signature: req.headers["x-bottleneck-signature"] as string,
});
if (!ok) {
  return res.status(401).end();
}
```

Within the freshness window a delivery can still legitimately arrive twice
(retries). Track the `X-Bottleneck-Delivery` id and skip ids you have already
processed.

## Errors

Failed requests throw `BottleneckAuthError`:

- `code`: the stable machine code — activation API codes like `rate_limited`,
  `invalid_credentials`, `return_url_not_allowed`, or OAuth codes like
  `invalid_grant`, `invalid_client`. Branch on this, not on the message.
- `status`: the HTTP status, or `0` when no response arrived.
- `retryAfterSeconds`: set on `429` responses from the `Retry-After` header.
- `responseBody`: the parsed error body.

Transport failures (DNS, refused connection, a connection dropped while the
body streams) throw with `code: "network_error"` and the underlying error as
`cause`; timeouts throw with `code: "timeout"`, and cover the whole request
including reading the response body. A `2xx` response whose body is not valid
JSON throws with `code: "invalid_response"`. Aborting via your own
`AbortSignal` rethrows your abort reason unchanged.

```ts
import { BottleneckAuthError } from "@bottleneck/auth-sdk";

try {
  await auth.exchangeCode({ ... });
} catch (err) {
  if (err instanceof BottleneckAuthError && err.code === "invalid_grant") {
    // re-issue the auth code, the verifier didn't match
  }
}
```

The SDK never retries automatically. `createActivationRequest` is safe to
retry yourself when you pass `idempotencyKey`; `revokeToken` and the read
methods are idempotent by nature.

## Not covered

The server supports more than this SDK wraps. Intentionally out of scope for
now, callable directly per the server docs: device authorization grant,
pushed authorization requests (PAR), dynamic client registration,
`private_key_jwt` client authentication, RP-initiated logout, OIDC
discovery/JWKS fetching, and local ID-token verification.

## References

- Activation broker: [`docs/external-apps.md`](https://github.com/bnecko/auth/blob/master/docs/external-apps.md)
- OAuth profile and discovery: [`docs/oauth.md`](https://github.com/bnecko/auth/blob/master/docs/oauth.md)

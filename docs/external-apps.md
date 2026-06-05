# External App Integration

This document describes how an external app integrates with Bottleneck Auth.

Base URL:

```text
https://auth.bneck.com
```

## Model

Bottleneck Auth is an activation broker.

Your app creates a short-lived activation request, sends the user to Bottleneck Auth, then checks whether the request was approved. The activation token is not a user session and must not be treated as a permanent credential.

Supported result delivery:

- polling `GET /api/activation-requests/:id`
- user return redirect through `returnUrl`
- server-to-server webhook delivery to a registered endpoint (see [Webhooks](#webhooks))

Polling and webhooks are not mutually exclusive — for high-volume apps prefer webhooks and use polling only as a fallback if a delivery has not arrived after a few seconds.

This activation broker is deliberately not OAuth: there is no `access_token`,
`refresh_token`, or `/userinfo`. It is the simplest way to get a one-time,
user-approved profile read. If you need standing tokens, JWKS, token
introspection, or RP-initiated logout, use the full OAuth 2.0 / OIDC support
instead. See [`oauth.md`](oauth.md) and [`conformance.md`](conformance.md).

All timestamps in this API are RFC 3339 / ISO 8601 (`2026-06-05T19:52:40.384Z`).

## App Credentials

Each external app needs:

- app id, stored internally as `external_apps.public_id`
- app slug
- bearer API key
- allowed return URL prefixes
- optional required subscription product

The API key is shown only once when issued. Store only its SHA-256 hash in `external_apps.api_key_hash`.

Example hash:

```sh
node -e "const { createHash } = require('crypto'); process.stdout.write(createHash('sha256').update(process.argv[1]).digest('hex') + '\n')" "your-api-key"
```

## Scopes

Supported scopes:

- `profile:read` (provides `id`, `firstName`, `username`, `bio`)
- `email:read` (optional for user)
- `dob:read` (optional for user)
- `subscription:read`

Only request scopes your app actually needs. Sensitive scopes (`email:read`, `dob:read`) are shown to the user with checkboxes and can be opted out of during the approval flow. If opted out, the API will return `null` for those fields.

## Activation Flow

1. Your app creates an activation request.
2. Your app redirects the user to `activationUrl`.
3. The user signs in or creates a Bottleneck account.
4. The user approves or denies the request.
5. Your app polls the activation status.
6. If approved, your app grants access according to the approved user id and requested scopes.

## Create Activation Request

```http
POST /api/activation-requests
Authorization: Bearer <app-api-key>
Content-Type: application/json
```

Request body:

```json
{
  "requestedSubject": "local-user-or-device-id",
  "scopes": ["profile:read", "subscription:read"],
  "returnUrl": "https://app.example.com/auth/bottleneck/return"
}
```

Fields:

- `requestedSubject`: optional app-local identifier, useful for matching pending requests. It is stored verbatim and never verified. It is your label, not an identity claim. See [Security Rules](#security-rules).
- `scopes`: optional list of requested scopes, defaults to `profile:read`
- `returnUrl`: optional URL to send the browser after approval
- `callbackUrl`: optional per-request override of the app's default webhook URL. Delivery happens through registered [webhook endpoints](#webhooks); registering an endpoint is what turns delivery on.

`returnUrl` must match the app's configured `allowed_redirect_urls` prefix list when that list is non-empty. Fetch `GET /api/apps/me` to read that list before sending users, rather than discovering a misconfiguration when every click 400s.

To make create idempotent across network retries, send an `Idempotency-Key`
header (8-255 chars). A replay with the same key returns the original response
(same token) instead of minting a duplicate request, for the lifetime of the
request:

```http
POST /api/activation-requests
Authorization: Bearer <app-api-key>
Idempotency-Key: 0f9c2b8a-…
```

Response:

```json
{
  "id": "act_xxx",
  "token": "opaque-token",
  "activationUrl": "https://auth.bneck.com/activate?token=opaque-token",
  "expiresAt": "2026-06-05T19:52:40.384Z"
}
```

Store `id` in your app. Do not store or reuse the activation token after redirecting the user.

## Redirect User

Redirect the user to:

```text
https://auth.bneck.com/activate?token=<opaque-token>
```

The user may need to sign in, register, or verify with Telegram before approving.

## Poll Activation Status

```http
GET /api/activation-requests/:id
Authorization: Bearer <app-api-key>
```

Response:

```json
{
  "id": "act_xxx",
  "status": "approved",
  "approvedUserId": 123,
  "revoked": false,
  "deniedReason": null,
  "expiresAt": "2026-06-05T19:52:40.384Z",
  "profile": {
    "id": "usr_abc123",
    "firstName": "Matthew",
    "username": "admin",
    "bio": "example bio",
    "email": "user@example.com",
    "dob": "2004-10-29"
  }
}
```

Response fields:

- `profile`: present only while `status` is `approved` and the grant is not revoked; `null` otherwise. If the user unchecked `email:read` or `dob:read` during approval, those fields are `null`.
- `revoked`: `true` once the app has revoked the grant (see [Revoke](#revoke-an-authorization)). The status stays `approved` but `profile` becomes `null`.
- `deniedReason`: a machine-readable reason when `status` is `denied` (today: `user_declined`), otherwise `null`.

Statuses:

- `pending`: waiting for user action
- `approved`: user approved and subscription checks passed
- `denied`: user denied
- `expired`: request is no longer valid
- `cancelled`: your app cancelled the request

Poll every 2-5 seconds while the user is in the activation flow. Stop polling when the status is no longer `pending` or when `expiresAt` passes. The endpoint is rate limited (see [Rate limits](#rate-limits)); honor `Retry-After` on a `429`.

## Cancel Activation Request

```http
POST /api/activation-requests/:id/cancel
Authorization: Bearer <app-api-key>
```

Response:

```json
{
  "status": "cancelled"
}
```

Use this when the user abandons the local flow or your app no longer needs the request. Cancel only works while a request is still `pending`; a `404` means it was already decided or never existed.

## App Config

```http
GET /api/apps/me
Authorization: Bearer <app-api-key>
```

Returns the calling app's own configuration so you can validate before sending users:

```json
{
  "id": "app_xxx",
  "name": "Example App",
  "slug": "example-app",
  "status": "active",
  "callbackUrl": "https://app.example.com/webhooks/bottleneck",
  "allowedRedirectUrls": ["https://app.example.com/auth/return"],
  "allowedScopes": ["profile:read", "email:read"],
  "requiredProduct": null
}
```

## List Activation Requests

```http
GET /api/activation-requests?subject=<id>&status=<status>
Authorization: Bearer <app-api-key>
```

Lists your app's own requests, newest first, optionally filtered by
`requestedSubject` and `status`. Use this to recover a request id you lost.

```json
{
  "requests": [
    {
      "id": "act_xxx",
      "status": "approved",
      "requestedSubject": "local-user-1",
      "approvedUserId": 123,
      "deniedReason": null,
      "createdAt": "2026-06-05T19:42:40.000Z",
      "expiresAt": "2026-06-05T19:52:40.384Z"
    }
  ]
}
```

## List Authorizations

```http
GET /api/authorizations
Authorization: Bearer <app-api-key>
```

The standing grants users have given your app: `subject` is the user's public
id, plus the granted scopes.

```json
{
  "authorizations": [
    { "subject": "usr_abc123", "scopes": ["profile:read", "email:read"], "createdAt": "2026-06-05T19:43:00.000Z" }
  ]
}
```

## Revoke an Authorization

```http
POST /api/activation-requests/:id/revoke
Authorization: Bearer <app-api-key>
```

Revokes the user's standing grant for an approved activation. The status
endpoint then reports `revoked: true` and stops returning the profile. A `409`
(`not_approved`) means the request was never approved.

```json
{ "id": "act_xxx", "revoked": true }
```

## Approval Result

When a request is approved:

- Bottleneck Auth records an app authorization for the user.
- The activation request status becomes `approved`.
- `approvedUserId` is set.
- If `returnUrl` was provided, the user's browser is redirected there.

Your app should still verify approval server-side by polling `GET /api/activation-requests/:id`. Do not trust the return redirect alone.

## Error Shape

Errors are JSON with a human-readable `error` and a stable machine-readable
`code`. Branch on `code`, not on the English string:

```json
{
  "error": "return url is not allowed",
  "code": "return_url_not_allowed"
}
```

Codes and their statuses:

| Code | Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | missing bearer api key |
| `invalid_credentials` | 401 | unknown or disabled app key |
| `return_url_not_allowed` | 400 | returnUrl not in the app allowlist |
| `not_found` | 404 | no such request for this app |
| `not_pending` | 409 | request already decided |
| `not_approved` | 409 | revoke target was never approved |
| `expired` | 410 | request lapsed |
| `subscription_required` | 403 | required product not active |
| `rate_limited` | 429 | see `Retry-After` |
| `internal_error` | 400 | unexpected failure |

## Rate limits

Per app key: create is 60/min, status polling is 300/min. Over the limit you
get `429` with `Retry-After` and `RateLimit-Reset` (both seconds). Honor
`Retry-After`; honest 2-5s polling never reaches the ceiling.

## Domain migration

`auth.bottleneck.cc` has moved to `auth.bneck.com`. The old origin returns
`410 Gone` for `/api/*` with `Deprecation`/`Sunset` headers and a `location`
pointing at the new origin. Update your base URL; do not follow the old origin
in code.

## Security Rules

- Keep the app API key server-side only.
- Never put the app API key in browser JavaScript.
- Use HTTPS return URLs.
- Treat activation tokens as short-lived one-time values.
- Bind each activation request to your local pending login/session state.
- Verify final status with the server before granting access.
- Request the smallest scope set possible.
- Cancel abandoned requests.
- `requestedSubject` is an unauthenticated label you supply. The auth server
  stores it but never verifies it against the user who approves. Match on it,
  but treat `approvedUserId` / `profile.id` as the only authoritative identity.
- The bearer API key is a single shared secret with no per-request signing. If
  it leaks, an attacker can mint and read activations for your app until you
  rotate it. Keep it in a secret manager and rotate on any suspected exposure.

## Webhooks

Bottleneck Auth delivers activation lifecycle events to a registered HTTPS endpoint. Register endpoints from the developer dashboard at `https://auth.bneck.com/developers/apps/<slug>`.

### Event types

- `activation.approved` — user approved the activation request
- `activation.denied` — user denied the request
- `activation.cancelled` — your app cancelled a pending request
- `activation.expired` — a pending request lapsed before the user acted

Each endpoint chooses which events it wants to receive at registration time. Additional event types (`user.created`, `oauth.grant.created`, `token.revoked`, `subscription.changed`) are reserved for future use.

### Endpoint registration

Endpoints are created from the developer dashboard. The signing secret is shown **once** on creation and never again — if you lose it, delete the endpoint and re-register.

Secret format: `whsec_` followed by 43 base64url characters.

### Request format

Each delivery is an HTTPS `POST` with JSON body and these headers:

```http
Content-Type: application/json
X-Bottleneck-Timestamp: 1715528400
X-Bottleneck-Signature: a3f4...64-hex-chars
X-Bottleneck-Event: activation.approved
X-Bottleneck-Delivery: whd_abc123
```

Body shape:

```json
{
  "id": "whd_abc123",
  "type": "activation.approved",
  "created": 1715528400,
  "data": {
    "id": "act_xxx",
    "status": "approved",
    "approvedUserId": "usr_xxx",
    "scopes": ["profile:read", "email:read"],
    "appId": "app_xxx",
    "returnUrl": "https://app.example.com/auth/return"
  }
}
```

`data` is the same payload your app would have received from `GET /api/activation-requests/:id`. Field availability matches the same scope rules.

### Signature verification

The signature is the lowercase hex digest of `HMAC-SHA256(secret, "<timestamp>.<body>")` where `<body>` is the exact bytes of the POST body and `<timestamp>` is the `X-Bottleneck-Timestamp` value. Verify in constant time.

The Node SDK ships a helper:

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

Reject any request older than ~5 minutes by comparing `X-Bottleneck-Timestamp` against your wall clock — this is your replay protection.

### Retries and idempotency

Bottleneck retries failed deliveries with exponential backoff:

| Failed attempts | Next retry after |
|-----------------|------------------|
| 1               | 1 minute         |
| 2               | 5 minutes        |
| 3               | 15 minutes       |
| 4               | 1 hour           |
| 5               | 4 hours          |
| 6               | 12 hours         |
| 7               | 24 hours         |
| 8               | gives up         |

A delivery is considered successful when your endpoint returns HTTP 2xx within 5 seconds. Any other response (including 3xx) is treated as failure. Use the `X-Bottleneck-Delivery` id to deduplicate — the same id may arrive more than once after a transient failure.

Return 2xx as soon as you have persisted the event. Do not run expensive work synchronously inside the handler.

## Minimal Server Example

```ts
const authBaseUrl = "https://auth.bneck.com";
const apiKey = process.env.BOTTLENECK_AUTH_API_KEY!;

export async function startBottleneckAuth(localUserId: string) {
  const response = await fetch(`${authBaseUrl}/api/activation-requests`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestedSubject: localUserId,
      scopes: ["profile:read", "subscription:read"],
      returnUrl: "https://app.example.com/auth/bottleneck/return",
    }),
  });

  if (!response.ok) {
    throw new Error("failed to create activation request");
  }

  return await response.json() as {
    id: string;
    activationUrl: string;
    expiresAt: string;
  };
}

export async function getBottleneckAuthStatus(id: string) {
  const response = await fetch(`${authBaseUrl}/api/activation-requests/${id}`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error("failed to fetch activation status");
  }

  return await response.json() as {
    id: string;
    status: "pending" | "approved" | "denied" | "expired" | "cancelled";
    approvedUserId: number | null;
    revoked: boolean;
    deniedReason: string | null;
    expiresAt: string;
    profile: {
      id: string;
      firstName: string;
      username: string;
      bio: string | null;
      email: string | null;
      dob: string | null;
    } | null;
  };
}
```

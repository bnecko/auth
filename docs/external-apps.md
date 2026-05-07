# External App Integration

This document describes how an external app integrates with Bottleneck Auth.

Base URL:

```text
https://auth.bottleneck.cc
```

## Model

Bottleneck Auth is an activation broker.

Your app creates a short-lived activation request, sends the user to Bottleneck Auth, then checks whether the request was approved. The activation token is not a user session and must not be treated as a permanent credential.

Supported result delivery:

- polling `GET /api/activation-requests/:id`
- user return redirect through `returnUrl`

Callback URLs are stored on activation requests, but server-to-server callback delivery is not implemented yet.

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

- `requestedSubject`: optional app-local identifier, useful for matching pending requests
- `scopes`: optional list of requested scopes, defaults to `profile:read`
- `returnUrl`: optional URL to send the browser after approval
- `callbackUrl`: accepted and stored, but callback delivery is not active yet

`returnUrl` must match the app's configured `allowed_redirect_urls` prefix list when that list is non-empty.

Response:

```json
{
  "id": "act_xxx",
  "token": "opaque-token",
  "activationUrl": "https://auth.bottleneck.cc/activate?token=opaque-token",
  "expiresAt": "2026-05-07 19:15:00+00"
}
```

Store `id` in your app. Do not store or reuse the activation token after redirecting the user.

## Redirect User

Redirect the user to:

```text
https://auth.bottleneck.cc/activate?token=<opaque-token>
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
  "expiresAt": "2026-05-07 19:15:00+00",
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

If the user unchecked `email:read` or `dob:read` during the approval flow, those respective fields in the `profile` object will be `null`.

Statuses:

- `pending`: waiting for user action
- `approved`: user approved and subscription checks passed
- `denied`: user denied
- `expired`: request is no longer valid
- `cancelled`: your app cancelled the request

Poll every 2-5 seconds while the user is in the activation flow. Stop polling when the status is no longer `pending` or when `expiresAt` passes.

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

Use this when the user abandons the local flow or your app no longer needs the request.

## Approval Result

When a request is approved:

- Bottleneck Auth records an app authorization for the user.
- The activation request status becomes `approved`.
- `approvedUserId` is set.
- If `returnUrl` was provided, the user's browser is redirected there.

Your app should still verify approval server-side by polling `GET /api/activation-requests/:id`. Do not trust the return redirect alone.

## Error Shape

Errors use JSON:

```json
{
  "error": "invalid app credentials"
}
```

Common HTTP statuses:

- `400`: invalid request, invalid return URL, expired or invalid activation
- `401`: missing or invalid bearer token
- `403`: forbidden action

## Security Rules

- Keep the app API key server-side only.
- Never put the app API key in browser JavaScript.
- Use HTTPS return URLs.
- Treat activation tokens as short-lived one-time values.
- Bind each activation request to your local pending login/session state.
- Verify final status with the server before granting access.
- Request the smallest scope set possible.
- Cancel abandoned requests.

## Minimal Server Example

```ts
const authBaseUrl = "https://auth.bottleneck.cc";
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
    expiresAt: string;
    profile?: {
      id: string;
      firstName: string;
      username: string;
      bio: string | null;
      email: string | null;
      dob: string | null;
    };
  };
}
```

# @bottleneck/auth-sdk

Server-side SDK for Bottleneck Auth. Covers the activation broker flow and OAuth 2.1 + PKCE.

```sh
npm install @bottleneck/auth-sdk
```

Requires Node.js 18.17+.

## Activation broker

Use when your app wants Bottleneck to authenticate a user once and return a short-lived activation result. The user clicks through Bottleneck, you poll for status.

```ts
import { BottleneckAuthClient } from "@bottleneck/auth-sdk";

const auth = new BottleneckAuthClient({
  issuer: "https://auth.bottleneck.cc",
});
const apiKey = process.env.BOTTLENECK_AUTH_API_KEY!;

const created = await auth.createActivationRequest({
  apiKey,
  requestedSubject: "local-user-42",
  scopes: ["profile:read", "email:read"],
  returnUrl: "https://app.example.com/auth/return",
});

// Redirect the user to created.activationUrl, then poll:
const status = await auth.getActivationStatus({ apiKey, id: created.id });
if (status.status === "approved" && status.profile) {
  // status.profile.id, status.profile.email, etc.
}
```

`profile` is always present in the response. It is `null` for any status other than `approved`, and individual fields may be `null` if the user unchecked the corresponding scope during approval.

Cancel a request the user has abandoned:

```ts
await auth.cancelActivationRequest({ apiKey, id: created.id });
```

## OAuth 2.1 + PKCE

Use when you want a standard OAuth Authorization Code + PKCE flow with access and refresh tokens. The current OAuth profile is `bn-oauth-2026-05`.

```ts
import { BottleneckAuthClient, generatePkcePair } from "@bottleneck/auth-sdk";

const auth = new BottleneckAuthClient({
  issuer: "https://auth.bottleneck.cc",
  clientId: process.env.BOTTLENECK_CLIENT_ID!,
  clientSecret: process.env.BOTTLENECK_CLIENT_SECRET!,
});

// 1. Start a flow. Store codeVerifier in your session.
const pkce = generatePkcePair();
const authUrl = auth.buildAuthorizationUrl({
  clientId: process.env.BOTTLENECK_CLIENT_ID!,
  redirectUri: "https://app.example.com/oauth/callback",
  scope: "openid profile email",
  state: "csrf-token-from-session",
  codeChallenge: pkce.codeChallenge,
});
// res.redirect(authUrl)

// 2. Exchange the code on your callback handler.
const tokens = await auth.exchangeCode({
  code: req.query.code as string,
  redirectUri: "https://app.example.com/oauth/callback",
  codeVerifier: pkce.codeVerifier,
});

// 3. Use the access token.
const user = await auth.userinfo(tokens.access_token);

// 4. Refresh later when the access token expires.
if (tokens.refresh_token) {
  const refreshed = await auth.refreshToken({ refreshToken: tokens.refresh_token });
}
```

Public clients (no `clientSecret`) construct the same way without the secret. The SDK sends `client_id` in the form body when no secret is configured.

## Token introspection

```ts
const result = await auth.introspect(tokens.access_token);
if (!result.active) {
  // Token has been revoked or expired.
}
```

## Webhook signature verification

For inbound webhooks signed by Bottleneck:

```ts
import { verifyWebhookSignature } from "@bottleneck/auth-sdk";

const ok = verifyWebhookSignature({
  secret: process.env.BOTTLENECK_WEBHOOK_SECRET!,
  timestamp: req.headers["x-bottleneck-timestamp"] as string,
  body: rawRequestBody,
  signature: req.headers["x-bottleneck-signature"] as string,
});
```

## Errors

Network and auth failures throw `BottleneckAuthError` with `status`, `code`, and `responseBody` for inspection:

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

## References

- Activation broker: [`docs/external-apps.md`](https://github.com/bottleneck-cc/auth/blob/master/docs/external-apps.md)
- OAuth profile and discovery: [`docs/oauth.md`](https://github.com/bottleneck-cc/auth/blob/master/docs/oauth.md)

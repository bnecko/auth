# Changelog

## 0.3.0 — 2026-08-28

First public release.

### Breaking

- Client authentication at the token, introspection, and revocation endpoints
  defaults to `client_secret_post`, matching how self-service apps are
  registered. Clients registered with `client_secret_basic` must pass
  `tokenEndpointAuthMethod: "client_secret_basic"`. Previous versions always
  sent Basic auth, which the server rejects for `client_secret_post` clients.
- `verifyWebhookSignature` now rejects timestamps outside a freshness window
  (default 300 seconds, configurable via `toleranceSeconds`) as replay
  protection. Malformed and far-future timestamps are also rejected, and a
  missing or malformed signature returns `false` instead of throwing.
- `BottleneckAuthError.code` now carries the stable machine code for
  activation API errors (`rate_limited`, `invalid_credentials`, …) instead of
  the human-readable message. OAuth-style errors are unchanged.
- Every network method applies a default 30-second timeout where 0.2.0
  waited indefinitely. Pass `timeoutMs: 0` (client option or per request) to
  disable it.
- Network failures and timeouts now throw `BottleneckAuthError` (`status: 0`,
  `code: "network_error"` or `"timeout"`) instead of leaking the underlying
  `TypeError`. Timeouts and aborts cover reading the response body, and a
  `2xx` response whose body is not valid JSON throws with
  `code: "invalid_response"`. Caller-initiated aborts still rethrow the abort
  reason.
- A configured `clientSecret` now requires a `clientId` at construction, and
  `introspect`/`revokeToken` require a configured `clientId`. 0.2.0 sent
  unauthenticated introspection that the server rejected anyway.
- License changed from MIT to Apache-2.0 to match the repository license. The
  package was never published under MIT.

### Added

- `tokenEndpointAuthMethod` client option: `client_secret_post`,
  `client_secret_basic`, or `none`.
- `revokeToken` (RFC 7009), `clientCredentialsGrant`, `revokeActivation`,
  `getAppConfig`, `listActivationRequests`, and `listAuthorizations`.
- `idempotencyKey` on `createActivationRequest`, sent as the
  `Idempotency-Key` header. Validated to the server's 8-255 character range,
  which the server otherwise ignores silently.
- Request lifecycle controls: client-level `fetch` and `timeoutMs` options,
  per-request `signal` and `timeoutMs` via a trailing `RequestOptions`
  argument on every network method.
- `retryAfterSeconds` on `BottleneckAuthError`, parsed from `Retry-After` on
  429 responses.
- `revoked` and `deniedReason` on `ActivationStatusResponse`, matching the
  server payload.
- Test suite (`npm test`) and packaged-consumer check (`npm run test:pack`).

## 0.2.0

Initial SDK skeleton: activation broker calls, OAuth code + refresh exchange,
PKCE helpers, webhook signature verification. Never published.

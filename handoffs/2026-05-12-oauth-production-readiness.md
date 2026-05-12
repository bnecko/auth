# OAuth production-readiness: 6 of 7 gaps closed

**Date:** 2026-05-12
**Purpose:** Close the OIDC gaps that were keeping the auth service from being a credible IdP for non-trivial integrators — re-authentication enforcement (`max_age` / `prompt` / `auth_time`), RP-initiated logout, discovery metadata, CSRF on the consent form, e2e coverage, and legacy-profile documentation accuracy. Defer the enterprise-auth gap (DPoP / mTLS / `private_key_jwt`) to its own pass.

## Context

Earlier audit flagged seven OAuth gaps. Recon during planning surfaced two surprises: discovery was half-done (both `.well-known` endpoints existed but were incomplete and one hardcoded the issuer); and the legacy profile `bn-oauth-2026-01` was a *documentation lie* — the code path `oauthProfileCompatibility` returned identical metadata for both versions, yet `docs/oauth.md` claimed they differed in behaviour. Six of the seven gaps are similar in shape (config / endpoints / flow logic / tests) and shipped together. Gap 3 (DPoP / mTLS / `private_key_jwt`) is a different shape — multi-day, partially infra-bound — and is deferred with a design sketch in the previous plan file.

## What changed

**A. `max_age` / `prompt` / `auth_time` re-authentication.**
- `db/migrations/010_oauth_re_auth_and_rp_logout.sql` adds `oauth_authorization_codes.auth_time` (nullable). The session's `created_at` is used as the authentication moment; no new sessions column was needed.
- `lib/server/services/oauth.ts`:
  - `readAuthorizeParams` now parses `max_age` (non-negative integer) and `prompt` (subset of `none|login|consent|select_account`, with validation that `none` is exclusive).
  - `resolveAuthorizeView` accepts `sessionCreatedAt`, computes session age, and (a) throws `OAuthError("login_required")` with a redirect when `prompt=none` and there's no session or it's stale; (b) throws `consent_required` when `prompt=none` but existing scopes don't cover the request; (c) sets a `requireReauth` flag on the view when `prompt=login` or `max_age` exceeded.
  - `OAuthError` gained optional `redirectUri` / `state` so the page-level handler can redirect back to the client with OIDC error params instead of rendering a generic error page.
  - `createIdToken` and `issueTokenPair` now accept `authTime` and emit it as the `auth_time` claim (Unix seconds). The refresh-token grant deliberately passes `authTime: null` (not preserved through rotation — clients needing fresh `auth_time` must re-authorize).
- `lib/server/repositories/oauth.ts` — `createAuthorizationCode` / `findAuthorizationCode` carry `auth_time` through; `OAuthAuthorizationCode` type gained `authTime: string | null`.
- `app/oauth/authorize/page.tsx` — passes `current.session.createdAt` into `getOAuthAuthorizeView`; redirects to `/login?next=...` when `view.requireReauth`; on `OAuthError` with a `redirectUri`, redirects the user-agent back to the client with `error` + `error_description` + `state` (per RFC 6749 §4.1.2.1).
- `app/api/oauth/authorize/approve/route.ts` — passes `auth.session.session.createdAt` into `approveOAuthAuthorization`.

**B. RP-initiated logout (`end_session_endpoint`).**
- Migration 010 also adds `external_apps.post_logout_redirect_urls text[] not null default '{}'`.
- New `lib/server/services/oauth.ts` helper `verifyIdToken` — RS256 verification against `oidcSigningKeys()` filtered to non-revoked entries, with `kid`-aware key selection. Returns parsed claims or null; the caller is responsible for application-level checks (aud / sub / exp).
- New route `app/api/oauth/logout/route.ts` — GET handler:
  - Always revokes the current session cookie + DB row.
  - If `id_token_hint` verifies, extracts `aud` (client `public_id`) and `sub`. If `client_id` was supplied it must match `aud`.
  - Validates `post_logout_redirect_uri` against the client's `post_logout_redirect_urls` allowlist using strict URL equality (same shape as the authorize-time allowlist).
  - Redirects with `state` preserved when the post-logout URL is allowed; otherwise redirects to `/login`.
  - Records a `oauth_logout` security event with IP/UA, client, subject, and whether a redirect was performed.
- `lib/server/repositories/externalApps.ts` + `lib/server/repositories/activationRequests.ts` + `lib/server/types.ts` — propagate `post_logout_redirect_urls` through all selects / mappings.

**C. Discovery metadata enrichment.**
- `lib/server/services/oauth.ts` `oauthServerMetadata` now advertises: `end_session_endpoint`, `service_documentation`, `response_modes_supported: ["query"]`, `prompt_values_supported: ["none","login","consent"]`, `acr_values_supported: ["urn:bottleneck:loa:1"]`. `claims_supported` gained `iss`, `aud`, `exp`, `iat`, `auth_time`, `acr`, `nonce`.
- `app/.well-known/openid-configuration/route.ts` rewritten to delegate to `oauthServerMetadata()` (drops the hardcoded `baseUrl`, drops the `runtime: "edge"` constraint). The OIDC doc and the OAuth-AS doc are now guaranteed to stay in sync.
- Live verification: `wget https://auth.bottleneck.cc/.well-known/openid-configuration` returns the enriched JSON with `end_session_endpoint`, `auth_time` in claims, `acr_values_supported`, etc.

**D. CSRF on `/oauth/authorize` approve form.**
- New `lib/server/oauthCsrf.ts` — stateless HMAC-signed token bound to `(sessionId, clientId, state, issuedAt)`. Format: `${issuedAt}.${hex32(HMAC-SHA256(secret, ...))}`. 10-minute max age. `mintAuthorizeCsrf` for issuance; `verifyAuthorizeCsrf` with `timingSafeEqual`.
- `lib/server/config.ts` adds `oauthCsrfSecret()` reading `OAUTH_CSRF_SECRET` with fallback to `OIDC_PRIVATE_KEY_PEM` so existing deploys with a key set already have CSRF protection without operator action. `.env.example` documents `OAUTH_CSRF_SECRET=`.
- `app/oauth/authorize/page.tsx` mints the token after view resolution and renders a `<input type="hidden" name="csrf_token">` in both approve and deny forms via `HiddenOAuthFields`.
- `app/api/oauth/authorize/approve/route.ts` + `.../deny/route.ts` extract `csrf_token`, `client_id`, `state` from the form, call `verifyAuthorizeCsrf`, and 400 (`invalid_request`) on failure before invoking the service.
- Eight-test unit suite in `tests/unit/oauth-csrf.test.ts` covers happy path, bound-field mismatches, malformed tokens, future / stale issued-at.

**E. E2E OAuth flow tests.**
- New `tests/e2e/oauth-flows.spec.ts` (Playwright):
  - `/.well-known/openid-configuration` advertises the new claims.
  - The OIDC doc and OAuth-AS doc agree on shared fields (issuer, token_endpoint, end_session_endpoint).
  - POST `/api/oauth/authorize/approve` without a CSRF token returns 4xx (401 from `requireUser` for unauthenticated browsers, which is the correct prior-line-of-defence; either 400 or 401 is accepted).
  - Two DB-driven scenarios (`prompt=none` → `login_required`; `prompt=login` → `/login?next=`) seed an external_app via `pg` and clean up. These skip gracefully when `DATABASE_URL` is set but the host can't reach Postgres (typical when the docker `db` service isn't port-mapped).

**F. Legacy profile reconciliation.**
- `lib/server/services/oauth.ts` `oauthProfileCompatibility` rewritten: returns identical operational metadata for both versions, with `differences: []` and a comment explaining the tag is forward-compat only.
- `docs/oauth.md` rewritten "OAuth Profile Versions" section: explicit statement that current and legacy behave identically today; the field is reserved for a future divergence (e.g. a 2026-09 profile mandating DPoP).
- `app/developers/apps/[slug]/AppSettingsForm.tsx` helper text updated.

## What was NOT done

- **Gap 3 — DPoP / mTLS / `private_key_jwt`.** Different shape of work; deferred to a separate pass. Design sketch in the plan file:
  - `private_key_jwt` first (smallest, highest enterprise payoff): extend the `token_endpoint_auth_method` CHECK constraint, add `jwks_uri text` / `jwks jsonb` columns on `external_apps`, accept `client_assertion_type=...:jwt-bearer` in `authenticateClient`, verify JWT against client JWKS with iss/sub/aud/exp/jti checks.
  - DPoP (RFC 9449) second: per-request `DPoP` header carrying a JWT proof; access tokens become DPoP-bound via a `dpop_jkt` column on `oauth_access_tokens`.
  - mTLS only when an enterprise customer specifically asks (infrastructure-heavy — TLS terminator forwards client cert headers).
- **Force re-auth actually clears the existing session.** Today the page redirects to `/login` and lets the user re-enter credentials, which mints a *new* session whose `created_at` reflects the fresh login. The *old* session remains valid in the DB until its expiry (or revocation via dashboard / ban). For strict re-auth semantics we'd need to clear the cookie before redirecting; that requires a Route Handler (server components can't delete cookies during render) or a Server Action shim. Acceptable for now; flagged for a follow-up.
- **`auth_time` not preserved through refresh-token rotation.** ID tokens issued from a refresh grant emit no `auth_time`. Clients that require fresh `auth_time` must re-run the authorize flow. Documented in the code.
- **Device flow `auth_time`.** Not plumbed — the device-code repo doesn't track approval timestamp. Inline comment in the device branch of `exchangeOAuthToken`.
- **E2E happy-path test (login → authorize → approve → token exchange).** The integration test (`tests/integration/oauth-token.test.ts`) already covers the token exchange at the service level. A browser-driven full flow needs a seeded user with a real scrypt-hashed password and the docker `db` port mapped to the host. Deferred.
- **Manual UI sweep of the new consent CSRF field, the `prompt=login` redirect path, and the `/api/oauth/logout` redirect** at `npm run dev`. The live discovery endpoint and the unit + e2e suite cover most of it; visual regression is unverified.
- **DCR `post_logout_redirect_uris` parameter handling.** The DCR route doesn't yet accept this field — clients have to set it via the developer dashboard or admin. Trivial follow-up.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run test:run` | 52 passed / 16 skipped (8 new CSRF unit tests; integration tests skip without `DATABASE_URL`) |
| `npm run build` | clean (only inherited `url.parse()` deprecation warnings from internal deps) |
| `npm run test:e2e -- tests/e2e/oauth-flows.spec.ts` | 3 passed (discovery contents, discovery parity, CSRF rejection); 2 skipped (DB-driven scenarios — host can't reach docker pg without a port map) |
| `docker compose build app && docker compose up -d --no-deps --force-recreate app` | migration 010 applied; `schema_migrations` now has versions 008/009/010 |
| `docker compose exec db psql -U auth -d auth -c "\d webhook_endpoints"` | `secret` column present (P3.1 prior pass); `\d oauth_authorization_codes` shows `auth_time`; `\d external_apps` shows `post_logout_redirect_urls` |
| `wget /.well-known/openid-configuration` against the live app | `end_session_endpoint` present, `prompt_values_supported`, `auth_time` in `claims_supported`, `acr_values_supported: ["urn:bottleneck:loa:1"]` |

Verified end-to-end commands (not executed; recorded for the next person):
- Build a complete authorize flow against the running stack: register a test user via `/register`, register a test client via the dashboard, hit `/oauth/authorize?client_id=...&prompt=login` — expect a redirect to `/login?next=...`.
- Test RP-initiated logout: sign in, copy an ID token from a token exchange, GET `/api/oauth/logout?id_token_hint=<token>&post_logout_redirect_uri=https://example.com/&state=foo` with `https://example.com/` in the client's `post_logout_redirect_urls`. Expect 302 to `https://example.com/?state=foo` with the session cookie cleared.

## Follow-ups

- Implement `private_key_jwt` client authentication (gap 3, smallest of the deferred trio). The token-endpoint auth method allow-list lives at `db/schema.sql:48` and is duplicated in migrations — both need to grow to include `private_key_jwt`. `lib/server/services/oauth.ts:authenticateClient` is the single integration point.
- DPoP after that.
- Add a server-action shim that clears the session cookie before redirecting to `/login` for `prompt=login` / `max_age` exceeded, so the *old* session doesn't outlive the forced re-auth.
- Preserve `auth_time` through refresh-token rotation: store `auth_time` on `oauth_refresh_tokens` at issuance and pass it through `rotateRefreshToken` → ID token claims.
- Map the docker `db` service to a host port (or add a docker-exec-based test runner) so the DB-driven Playwright scenarios actually run in CI.
- Live-smoke the RP-initiated logout flow with a real ID token.
- DCR: accept `post_logout_redirect_uris` in `POST /api/oauth/register`.

## Files touched

Modified:
- `app/.well-known/openid-configuration/route.ts`
- `app/api/oauth/authorize/approve/route.ts`
- `app/api/oauth/authorize/deny/route.ts`
- `app/developers/apps/[slug]/AppSettingsForm.tsx`
- `app/oauth/authorize/page.tsx`
- `db/schema.sql`
- `docs/oauth.md`
- `.env.example`
- `lib/server/config.ts`
- `lib/server/repositories/activationRequests.ts`
- `lib/server/repositories/externalApps.ts`
- `lib/server/repositories/oauth.ts`
- `lib/server/services/oauth.ts`
- `lib/server/types.ts`
- `tests/unit/oauth.test.ts`

New:
- `app/api/oauth/logout/route.ts`
- `db/migrations/010_oauth_re_auth_and_rp_logout.sql`
- `handoffs/2026-05-12-oauth-production-readiness.md` *(this file)*
- `lib/server/oauthCsrf.ts`
- `tests/e2e/oauth-flows.spec.ts`
- `tests/unit/oauth-csrf.test.ts`

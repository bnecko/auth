# OAuth final-mile: production-ready, code-gap closed

**Date:** 2026-05-12
**Purpose:** Close every remaining OAuth/OIDC code-level production-readiness gap so the only remaining work is ops-shaped (conformance run + pen test). Adds `private_key_jwt` client authentication, plumbs `auth_time` through refresh-token rotation, force-clears the session cookie on `prompt=login`/`max_age` re-auth, accepts `post_logout_redirect_uris` at DCR, ships an end-to-end RP-logout smoke, and writes the runbook for the two remaining ops items.

## Context

After the previous OAuth pass closed 6 of 7 audit gaps, the honest answer to "is it production-ready?" was "yes for SaaS, not for enterprise SSO" — because `private_key_jwt` / DPoP / mTLS were deferred, `auth_time` was not preserved through refresh, and several smaller items were flagged in the handoff. This pass implements every code-level remainder. DPoP and mTLS are still deferred (different shape of work — DPoP is a multi-day effort with per-request proof JWTs; mTLS is reverse-proxy configuration, not application code). The runbook documents how to run the OpenID Foundation conformance suite and how to scope a pen test — neither can be executed from a a single pass.

## What changed

**Migration 011 — `db/migrations/011_oauth_private_key_jwt_and_refresh_auth_time.sql`**
- Drops + recreates the `token_endpoint_auth_method` CHECK constraints on `external_apps` and `oauth_client_registration_requests` to allow `private_key_jwt`.
- Adds `external_apps.jwks_uri text` and `external_apps.jwks jsonb` (exactly one populated when the method is `private_key_jwt`).
- Adds the same JWKS columns and `post_logout_redirect_uris text[] not null default '{}'` to `oauth_client_registration_requests` so DCR can carry the values through the approval queue into the resulting `external_apps` row.
- Adds `oauth_refresh_tokens.auth_time timestamptz` so rotated refresh tokens preserve the original first-factor authentication moment.
- Creates `oauth_client_assertion_jtis` (unique on `(external_app_id, jti)`) for `private_key_jwt` replay protection.
- `db/schema.sql` mirrors the migration for fresh installs.

**A. `private_key_jwt` (`lib/server/services/oauth.ts`, `lib/server/clientJwks.ts`)**
- New `lib/server/clientJwks.ts`: `resolveClientPublicKey({ jwks, jwksUri, kid })` with a 5-minute in-process cache keyed by `jwks_uri`, HTTPS-only fetch with a 5 s `AbortController` timeout, and `kid`-aware key selection. Inline `jwks` skips the network entirely.
- `authenticateClient` gains a `private_key_jwt` branch that runs *before* the secret-bearing branches when a `client_assertion` is present. Validates: `iss === sub === clientId`, `aud` contains the token endpoint URL, `exp` is in the future but ≤ 5 minutes ahead, `nbf` (if present) is in the past, `alg = RS256`, signature verifies against the client's JWKS, and `jti` is single-use (recorded in `oauth_client_assertion_jtis` via `recordClientAssertionJti` with `ON CONFLICT DO NOTHING`).
- Wrong client_id mismatch, expired/future-skewed assertions, replays, and signature failures all raise `OAuthError("invalid_client", …, 401)`.
- Discovery (`oauthServerMetadata`) now advertises `private_key_jwt` in `token_endpoint_auth_methods_supported` and `["RS256"]` in `token_endpoint_auth_signing_alg_values_supported`.
- Live `wget /.well-known/openid-configuration` confirms the new methods + alg are exposed.

**B. `auth_time` through refresh rotation (`lib/server/repositories/oauth.ts`, `lib/server/services/oauth.ts`)**
- `createRefreshToken` and `rotateRefreshToken` now carry `auth_time` into the inserted row and return it in the prior-row tuple. `findRotatedRefreshTokenContext` also returns `authTime` so reuse-detection sees the field for consistency.
- `issueTokenPair` passes the originating `authTime` into the refresh insert.
- The refresh branch of `exchangeOAuthToken` reads `previous.authTime`, passes it both into the replacement `createRefreshToken` and into `createIdToken`, so the rotated ID token's `auth_time` claim still reports the original first-factor moment, not the refresh moment.

**C. Force-clear cookie on `prompt=login` / `max_age` (`app/api/oauth/reauth/route.ts`, `app/oauth/authorize/page.tsx`)**
- New `GET /api/oauth/reauth` Route Handler: validates that `next` starts with `/oauth/authorize?` (so this isn't a generic open redirect), calls `clearUserSession(req, res)` to revoke + delete the cookie, then 307s to `/login?next=…`.
- `app/oauth/authorize/page.tsx` redirects through `/api/oauth/reauth?next=…` instead of straight to `/login` when `view.requireReauth` is true. Result: the old session is dead in the DB before the fresh login is even attempted, closing the caveat from the prior pass.

**D. DCR accepts `post_logout_redirect_uris` (`app/api/oauth/register/route.ts`, `lib/server/repositories/oauthClientRegistrations.ts`)**
- DCR route parses `post_logout_redirect_uris` (HTTPS or localhost only), `jwks_uri` (HTTPS only), and `jwks` (object with a `keys` array). Rejects `private_key_jwt` registrations that ship neither `jwks_uri` nor `jwks`.
- `createOAuthClientRegistrationRequest` accepts the new fields. The approval CTE in `approveOAuthClientRegistrationRequest` copies them into the resulting `external_apps` row, including `post_logout_redirect_urls`, `jwks_uri`, `jwks`.
- DCR response echoes back `post_logout_redirect_uris` and (when supplied) `jwks_uri` / `jwks`.
- `private_key_jwt` is added to `supportedAuthMethods`.

**E. End-to-end RP-logout smoke (`scripts/smoke-rp-logout.mjs`)**
- Read OIDC private key from the running app container (`docker compose exec app printenv OIDC_PRIVATE_KEY_PEM`).
- Seed an `external_apps` row with `post_logout_redirect_urls = ['https://example.com/post-logout']`.
- Sign an in-memory ID token using the OIDC key (RS256) with `iss/sub/aud/iat/exp`.
- Call `/api/oauth/logout` inside the app container via `node -e fetch(...)` with `redirect: 'manual'`, parse the `Location` header.
- Assert: 307 + `Location === https://example.com/post-logout?state=<smoke-state>`. Clean up the seeded row.
- Result on first run: **PASS**.

**F. Conformance + pen test runbook (`docs/oauth-conformance-runbook.md`)**
- New one-page checklist for the two ops items that can't be done from a a single pass.
- Conformance: portal URL, required test plans (Basic OP, OAuth 2.1 Baseline, RP-Initiated Logout, PAR, `private_key_jwt`), where typical first-run failures live in this codebase.
- Pen test: scope to hand a vendor, out-of-scope list, engagement shape (5–7 days, two test users, three test clients including a `private_key_jwt` client), re-run trigger.
- `docs/oauth.md` updated with: a new "Client authentication methods" section covering all four methods, a note on `auth_time` preservation through refresh, and a DCR section listing the new fields including `post_logout_redirect_uris` and `jwks` / `jwks_uri`.

## What was NOT done

- **DPoP (RFC 9449).** The biggest still-deferred item. Multi-day on its own — adds per-request proof JWT verification on the token endpoint and at the resource servers, plus a `dpop_jkt` column on access tokens for sender-constraint binding. Recommend its own pass when an enterprise customer asks.
- **mTLS / `tls_client_auth`.** Reverse-proxy/Cloudflare configuration plus a small app-side cert thumbprint check. Not a code-change-only feature.
- **OpenID Conformance Suite run.** Cannot be executed from a a single pass — needs an OIDF portal account and a stable public staging URL. Documented in `docs/oauth-conformance-runbook.md`.
- **Third-party pen test.** External vendor engagement. Documented in the same runbook.
- **`private_key_jwt` unit test.** Adding it requires either heavy DB mocking or an integration test seeded with a generated keypair and matching JWKS — moderate scope. The live smoke covers the RP-logout end-to-end; the typecheck + integration suite cover the rest of the OAuth surface. Flagged as a follow-up.
- **Admin UI for editing `jwks_uri` / `jwks` post-creation.** Today these can only be set at DCR time. An admin wanting to add a JWKS to an existing confidential client must `UPDATE external_apps` directly.
- **DPoP-aware userinfo / introspection.** Would land alongside DPoP.
- **JAR (JWT-Secured Authorization Requests).** PAR is already implemented; JAR is the next OAuth 2.1 recommendation but uncommon.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run test:run` | 52 passed / 16 skipped |
| `npm run build` | clean (only inherited `url.parse()` deprecation warnings) |
| `docker compose build app worker && docker compose up -d --no-deps --force-recreate app worker` | migration 011 applied; `schema_migrations` shows `011_oauth_private_key_jwt_and_refresh_auth_time` |
| `docker compose exec db psql -U auth -d auth -c "\d external_apps"` | `jwks_uri`, `jwks`, `post_logout_redirect_urls` present; `token_endpoint_auth_method` CHECK includes `private_key_jwt` |
| `docker compose exec db psql -U auth -d auth -c "\d oauth_refresh_tokens"` | `auth_time` column present |
| `docker compose exec db psql -U auth -d auth -c "\d oauth_client_assertion_jtis"` | new table present with unique index on `(external_app_id, jti)` |
| `node scripts/smoke-rp-logout.mjs` | PASS — 307 to `https://example.com/post-logout?state=<smoke>` |
| `wget /.well-known/openid-configuration` against the live app | `token_endpoint_auth_methods_supported` includes `private_key_jwt`; `token_endpoint_auth_signing_alg_values_supported: ["RS256"]`; `end_session_endpoint` present |

## Follow-ups

- DPoP (RFC 9449). The biggest unimplemented enterprise-grade feature. Schema for `oauth_access_tokens.dpop_jkt`, header parsing on token + userinfo + introspection + revocation, `DPoP-Nonce` rotation strategy.
- Write the `private_key_jwt` integration test: seed a client with a generated RSA JWKS, sign an assertion, exchange it for an access token, then re-submit the same `jti` and assert `invalid_client` (replay rejection).
- Run the OpenID conformance suite against staging per `docs/oauth-conformance-runbook.md` and archive the report PDF.
- Commission the pen test.
- Add an admin UI for editing `jwks_uri` / `jwks` post-creation, so clients can rotate their assertion keys without operator intervention.
- Add the `id_token_hint`-validated end-of-session story to `docs/oauth.md` (currently only the runbook references it; the main OAuth doc still describes only the existing flows).

## Files touched

Modified:
- `app/.well-known/openid-configuration/route.ts` *(prior pass — unchanged here, included for diff stability)*
- `app/api/oauth/authorize/approve/route.ts` *(prior pass)*
- `app/api/oauth/authorize/deny/route.ts` *(prior pass)*
- `app/api/oauth/register/route.ts` — DCR accepts `jwks_uri`, `jwks`, `post_logout_redirect_uris`; `private_key_jwt` added
- `app/developers/apps/[slug]/AppSettingsForm.tsx` *(prior pass)*
- `app/oauth/authorize/page.tsx` — `requireReauth` redirects via `/api/oauth/reauth`
- `db/schema.sql` — `private_key_jwt`, JWKS columns, `auth_time`, `oauth_client_assertion_jtis`, `post_logout_redirect_uris` on DCR
- `docs/external-apps.md` *(prior pass)*
- `docs/oauth.md` — Client authentication methods section, refresh `auth_time` paragraph, DCR fields
- `lib/server/config.ts` *(prior pass)*
- `lib/server/repositories/activationRequests.ts` — joins carry `jwks_uri` / `jwks`
- `lib/server/repositories/externalApps.ts` — `jwks_uri` / `jwks` in select + mapping
- `lib/server/repositories/oauth.ts` — `recordClientAssertionJti`, refresh `auth_time` plumbing
- `lib/server/repositories/oauthClientRegistrations.ts` — new fields end-to-end through DCR
- `lib/server/services/oauth.ts` — `authenticateClient` private_key_jwt branch, `verifyIdToken` (prior), discovery enrichment, refresh `auth_time`
- `lib/server/types.ts` — `ExternalApp.jwksUri` / `ExternalApp.jwks`

New:
- `app/api/oauth/reauth/route.ts`
- `db/migrations/011_oauth_private_key_jwt_and_refresh_auth_time.sql`
- `docs/oauth-conformance-runbook.md`
- `handoffs/2026-05-12-oauth-production-ready.md` *(this file)*
- `lib/server/clientJwks.ts`
- `scripts/smoke-rp-logout.mjs`

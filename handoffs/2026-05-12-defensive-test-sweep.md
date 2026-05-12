# Defensive test sweep

**Date:** 2026-05-12
**Purpose:** Close the test-coverage gaps that have been compounding across the last few passes. Rate-limiter, Turnstile, CSP, session lifecycle, WebAuthn repo, DCR flow, and OAuth introspect/revoke/userinfo were all unverified — now they have durable tests so the next change can't quietly regress them.

## Context

After three OAuth passes, the OAuth + webhook surfaces are well-tested but the supporting infrastructure (rate-limiter, Turnstile bot check, CSP middleware, session repo, WebAuthn repo, DCR end-to-end, OAuth resource endpoints) had zero coverage. This pass adds 8 new test files — 3 unit, 4 integration (DB-gated), 1 e2e — that together raise the suite from 52 passing / 16 skipped to **71 passing / 37 skipped** (stable across 5 consecutive runs). No new features.

Approach:
- **Unit** for pure or easily-mockable logic. `vi.spyOn(globalThis, 'fetch')` for Turnstile. `vi.mock("@/lib/server/redis")` with an in-memory fake for rate-limit. Pure helpers exported from middleware for CSP.
- **Integration** (DB-gated, follow existing `describeDb` pattern) for repositories and service-level flows.
- **E2E** only where the test must hit running middleware (CSP / security headers).

## What changed

### Unit tests

**`tests/unit/turnstile.test.ts` (new, 7 tests)** — mocks `globalThis.fetch`. Verifies: success path, Cloudflare-reported failure, missing token short-circuits (no fetch), no-secret-in-dev fail-open, no-secret-in-production throws, upstream 5xx returns false, and `remoteip` is included only when provided.

**`tests/unit/rate-limit.test.ts` (new, 6 tests)** — `vi.mock` replaces `@/lib/server/redis` with an in-memory fake implementing `multi() / incr / pttl / pexpire`. Tests first-call, expire setting (pttl=-1 triggers pexpire(windowMs)), exact-at-limit boundary, exceed-limit (success=false), key isolation, and fail-open when `multi().exec()` returns null (transient Redis error).

**`tests/unit/csp.test.ts` (new, 6 tests) + `middleware.ts` (modified)** — `nonce` and `contentSecurityPolicy` are now exported from `middleware.ts` (the rest of the middleware stays internal). Tests: `nonce()` returns a fresh base64 string each call; production CSP uses `nonce-…` + `strict-dynamic` and never `unsafe-inline`/`unsafe-eval`; non-production CSP includes both unsafe directives for HMR; all required directives present (`default-src`, `base-uri`, `frame-ancestors 'none'`, `form-action`, `img-src`, `script-src`, `frame-src`, `style-src`, `font-src`, `connect-src`, `object-src 'none'`); Turnstile + Telegram origins in script-src and frame-src. Uses `vi.stubEnv` so the readonly-typed `NODE_ENV` is mutated safely.

### Integration tests (DB-gated)

**`tests/integration/session-lifecycle.test.ts` (new, 7 tests)** — `createSession` + `findSessionByToken` roundtrip with `last_seen_at` bump, `revokeSession` by token, `revokeSessionById` dual-keyed by userId (wrong userId is a no-op), `revokeSessionsForUser` per-user isolation, `revokeOtherSessionsForUser` keeps the current session alive, `listSessionsForUser` excludes revoked, and admin-ban via `setAccountStatus` triggers cascade session revocation.

**`tests/integration/webauthn-repo.test.ts` (new, 4 tests)** — `createWebauthnCredential` roundtrip, `findWebauthnCredentialsByUser` returns only that user's rows, `updateWebauthnCredentialSignCount` bumps counter + `last_used_at`, `deleteWebauthnCredential` dual-key (wrong user → false + row preserved, right user → true + row gone).

**`tests/integration/dcr.test.ts` (new, 3 tests)** — `createOAuthClientRegistrationRequest` with `private_key_jwt` + `jwks_uri` + `post_logout_redirect_uris` carries every field through; `listPendingOAuthClientRegistrationRequests` + `findOAuthClientRegistrationRequestForToken` retrieve it; `approveOAuthClientRegistrationRequest` creates an `external_apps` row with `token_endpoint_auth_method='private_key_jwt'`, the inline `jwks` blob, and `post_logout_redirect_urls` all propagated correctly; `revealOAuthClientRegistrationSecret` returns plaintext once and null forever after.

**`tests/integration/oauth-introspect-revoke-userinfo.test.ts` (new, 7 tests)** — gated on `DATABASE_URL` + (`OIDC_PRIVATE_KEY_PEM` or `OIDC_SIGNING_KEYS_JSON`). Seeds a user + confidential client, runs a real PKCE code-exchange via `exchangeOAuthToken`, then asserts: introspect active=true with `client_id`/`sub`/`scope`/`exp` for a valid token; introspect active=false for an unknown token; revoke+introspect cycle yields active=false; userinfo returns scope-aware claims; userinfo omits `email` when `email:read` not granted; userinfo returns null for a banned user; userinfo returns null for an unknown token.

### E2E

**`tests/e2e/auth-flows.spec.ts` (modified)** — new "security headers are set on every response" test. `GET /login` is asserted to return `Content-Security-Policy` (containing `frame-ancestors 'none'`, `object-src 'none'`, `default-src 'self'`, and either a nonce or `unsafe-inline` depending on `NODE_ENV`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`. Catches middleware regressions any future change might introduce.

## What was NOT done

- **`risk.ts`.** Touches both DB and Redis. Adding tests for it requires either both backends reachable from the host (currently neither is port-mapped from docker compose) or selective mocking of both. The scoring logic is also nontrivial enough that a half-tested version would be misleading. Deferred to its own focused test pass.
- **Middleware function-level unit test.** Next.js runtime coupling makes testing the full middleware function not worth the harness. The pure CSP helper is what carries the security policy logic anyway.
- **Full WebAuthn registration/authentication flow.** Browser-side challenge construction with `@simplewebauthn/server` is heavy; the repo CRUD tests cover our database-level exposure.
- **DPoP, mTLS, JAR, pairwise subjects, resource indicators.** Out of scope (not features in the codebase yet).
- **OpenID conformance suite + pen test.** Documented in `docs/oauth-conformance-runbook.md` — ops, not code.
- **Manual UI sweep.** No UI changed this pass.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run test:run` (5 consecutive runs) | **71 passed / 37 skipped (108)** — stable; integration tests skip when DATABASE_URL/OIDC env missing |
| `npm run test:e2e -- auth-flows.spec.ts` | 6 passed (including new security-headers test) |
| `npm run build` | clean (only inherited `url.parse()` deprecation warnings) |
| Unit-only run (`-- tests/unit/`) | 71 passed (no flakes; the new turnstile/rate-limit/csp tests cover behaviour previously unverified) |

Test count diff from prior pass: **+19 passing**, **+21 skipped** (DB-gated). No regressions.

## Follow-ups

- Risk-scoring test: needs both DB and Redis reachable. Either map both ports in compose, run vitest inside a one-shot container on the docker network, or split the helper so the scoring rules are pure and DB queries are injectable.
- Full WebAuthn registration test with a real challenge object — would catch any drift in how we parse the assertion shape.
- DPoP implementation (still the single biggest enterprise-grade gap).
- Run the OpenID conformance suite per `docs/oauth-conformance-runbook.md` and commission the pen test — both gated on a public staging URL and an external account/vendor.

## Files touched

Modified:
- `middleware.ts` — `nonce` and `contentSecurityPolicy` are now exported (behaviour unchanged)
- `tests/e2e/auth-flows.spec.ts` — added security-headers test

New:
- `handoffs/2026-05-12-defensive-test-sweep.md` *(this file)*
- `tests/integration/dcr.test.ts`
- `tests/integration/oauth-introspect-revoke-userinfo.test.ts`
- `tests/integration/session-lifecycle.test.ts`
- `tests/integration/webauthn-repo.test.ts`
- `tests/unit/csp.test.ts`
- `tests/unit/rate-limit.test.ts`
- `tests/unit/turnstile.test.ts`

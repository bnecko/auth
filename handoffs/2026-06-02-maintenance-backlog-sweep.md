# Maintenance backlog sweep: deps, test coverage, webhook reliability

**Date:** 2026-06-02
**Purpose:** Work down the prioritized maintenance backlog top-to-bottom — dependency hygiene, the untested security/reliability paths flagged across the May-12 handoffs, and the webhook lifecycle gaps — landing each as a verified, separately-reviewable commit.

## Context

The codebase was healthy (zero vulns, clean CI, no debt markers) but carried a documented backlog: untested risk-scoring and `private_key_jwt`, no worker-delivery test, manual-only dependency updates, and several webhook lifecycle gaps (`activation.expired` never fired, no auto-disable, delete+re-register as the only rotation). This pass closes the tractable items and defers the ones that need a product decision, substantial UI, or multi-day effort. Work is on branch `maintenance/backlog-sweep` (12 commits), not yet merged to `master`.

## What changed

Dependencies / tooling:
- `package.json`, `package-lock.json` — refreshed all in-range deps (`npm update`). Pinned `ioredis` to an exact `5.10.1`: bullmq pins ioredis exactly, and floating the top-level copy ahead of it resolves two incompatible `ioredis` installs that break the `Queue` connection type in `lib/server/queue.ts`. `@types/node` held at 22.x to match the runtime.
- `.nvmrc` (new), `package.json` `engines` — pin Node 22 for local dev; `.github/workflows/security.yml` now reads the version from `.nvmrc`.
- `.github/dependabot.yml` (new) — weekly npm (root + `sdk/node`) and Actions updates, patch/minor grouped, majors individual; ignores `@types/node` major and `ioredis` (managed via bullmq's pin).
- `sdk/node/package.json`, `sdk/node/README.md` — repository links pointed at the actual remote `github.com/SynapLink/auth` (were `bottleneck-cc/auth`). **Assumption:** the verified git remote is canonical; if the repo is meant to live under a `bottleneck-cc` org, revert these two.

Test coverage:
- `lib/server/risk.ts` — split the pure score weighting into `scoreRisk(signals)`; `assessRequestRisk` keeps the I/O and the same await ordering. `tests/unit/risk.test.ts` (new) covers the bands, the either/or IP tiers, the new-country/new-UA baseline guard, and reason ordering.
- `tests/integration/oauth-private-key-jwt.test.ts` (new) — generates an RSA JWKS, signs a client assertion, exchanges a code, and asserts `jti` single-use replay rejection (`invalid_client`) and signature rejection for a non-JWKS key.
- `tests/integration/webhook-delivery.test.ts` (new) — exercises the worker delivery loop against a local HTTP fixture: 2xx → delivered with a verifiable signature; 5xx → first backoff step; repeated failure → `failed` at `MAX_ATTEMPTS`; plus the auto-disable behavior below.
- `tests/e2e/visual.spec.ts` (new) — asserts the Operator Console design tokens (`--accent`, `--bg`, JetBrains Mono) resolve on `/login`, `/forgot`, `/oauth/authorize` (error). Token assertions, not pixel snapshots, to avoid the macOS/Linux rendering flake.

Worker (`worker.js`):
- Made dual-mode: the Redis/BullMQ startup and poll timers are behind `if (require.main === module)`; the delivery functions are exported, so tests import them without opening a Redis connection. `node worker.js` behavior is unchanged.
- SSRF guard now allows loopback hosts when `NODE_ENV !== 'production'`, matching what endpoint registration already permits for local receivers. The deployed worker sets `NODE_ENV=production` (Dockerfile worker stage), so production loopback stays blocked.

Webhooks:
- `activation.expired` (new event) — a per-minute worker sweep (`sweepExpiredActivations`) transitions pending activations past `expires_at` to `expired` and enqueues a delivery for every subscribed endpoint, in one atomic CTE. Added to the `webhookEventTypes` allowlist, the endpoint event picker, and `docs/external-apps.md`.
- Auto-disable — `db/migrations/013_webhook_auto_disable.sql` adds `webhook_endpoints.consecutive_failures`. The worker increments it when a delivery exhausts retries, resets it on the first success, and at 5 (`AUTO_DISABLE_THRESHOLD`) flips the endpoint to `disabled` and records a `webhook_endpoint_auto_disabled` security event.
- Secret rotation — `rotateWebhookEndpointSecret` + a "rotate secret" dashboard action/button issue a fresh `whsec_` secret in place, preserving the endpoint id, subscriptions, and delivery history. Single-swap (no dual-sign grace window): the receiver must update in lockstep.

## What was NOT done

These four items are deferred. Each is more than a mechanical wire-up.

- **`user.created` / `oauth.grant.created` / `subscription.changed` webhook events (T3.10).** The allowlist supports them but they do not fire, because the scoping is a product decision, not code:
  - `oauth.grant.created` is app-scoped but low value — the app just completed the OAuth flow, so it already knows.
  - `token.revoked` is valuable only at the out-of-band revocation points (admin ban cascade in `lib/server/services/admin.ts:setAccountStatus`, user dashboard revocation), where it must enumerate the distinct apps whose tokens were revoked for the user and fire per-app. ~40 lines + test; clean, no privacy issue (the app already held a grant). This is the best next slice if any are wired.
  - `user.created` is global, not app-scoped. Broadcasting new-user events to every app is a **privacy decision** (it leaks registrations). Needs an explicit "which apps, if any" answer before wiring.
  - `subscription.changed` is user-scoped; the natural recipients are apps with an active authorization for that user. Needs the same scoping decision.
- **Admin/owner UI to edit `jwks_uri` / `jwks` post-creation (T3.11).** Today these are set only at DCR time; rotating a `private_key_jwt` client's keys needs a manual `UPDATE external_apps`. Design: a repo `updateExternalAppJwks(appId, ownerId, {jwksUri, jwks})`, a server action reusing the DCR route's validation (`app/api/oauth/register/route.ts` — `jwks_uri` https-only, `jwks` object with a `keys` array, exactly one populated), and a form in `app/developers/apps/[slug]/AppSettingsForm.tsx` shown only when `tokenEndpointAuthMethod === 'private_key_jwt'`. Deferred as unverified UI is risky to land untested; the SQL workaround exists.
- **DPoP (RFC 9449) and JAR (T3.12).** Deliberately deferred across every prior OAuth handoff; multi-day. DPoP design sketch (from `handoffs/2026-05-12-oauth-production-ready.md`): `oauth_access_tokens.dpop_jkt` column; `DPoP` proof-JWT verification on the token endpoint, userinfo, introspection, revocation; `DPoP-Nonce` rotation. JAR follows. Should be its own focused pass.
- **OpenID conformance run + third-party pen test (T4.15).** Cannot run from here — needs an OIDF portal account, a public staging URL, and an external vendor. Procedure is current in `docs/oauth-conformance-runbook.md`.

Also not done: secret-rotation dual-sign grace window (current rotation is a hard swap); a dedicated `risk.ts` integration test through `assessRequestRisk` (the pure `scoreRisk` is unit-tested; the DB lookups are exercised indirectly).

## Verification

- `npx tsc --noEmit` — clean (run after every change).
- `npm run test:run` against a throwaway Postgres — **145 passed / 0 skipped (25 files)**. Without `DATABASE_URL` (fresh checkout): **94 passed / 51 skipped**.
- `npm run build` — clean; all routes compile including the changed `/developers/apps/[slug]` surfaces.
- `npm run migrate` + `npm run migrate:smoke` — clean (migration 013 applies idempotently).
- `npx playwright test visual.spec.ts` — 3 passed (dev server auto-started; pre-existing React dev-mode CSP-nonce hydration warning in server log, unrelated to this change).
- New DB-gated tests run automatically in CI: `security.yml` already provides a Postgres service on `localhost:5432` with `DATABASE_URL` + `OIDC_PRIVATE_KEY_PEM`, so the integration suites and the DB-driven Playwright scenarios execute there (T4.13 was already satisfied by that service; this pass only documented local runs in the README).
- NOT run: manual browser check of the rotate-secret button and the `activation.expired` picker option; no live webhook delivery to a real receiver (the worker loop is unit/integration covered, not end-to-end against an external URL this pass).

## Follow-ups

- Decide the `user.created` / `subscription.changed` recipient scoping (privacy), then wire them and `token.revoked` (start with the ban-cascade fire point in `lib/server/services/admin.ts`). Reuse `enqueueWebhookEvent(appId, ...)`.
- Build the `jwks_uri`/`jwks` edit UI (T3.11) per the design above.
- Schedule DPoP (T3.12) as its own pass; JAR after.
- Run the conformance suite and commission the pen test (T4.15) once a public staging URL exists.
- When bullmq next bumps its pinned `ioredis`, raise the exact pin in `package.json` to match and drop the Dependabot ignore.
- Merge `maintenance/backlog-sweep` to `master`.

## Files touched

- `package.json`, `package-lock.json`, `.nvmrc` (new)
- `.github/workflows/security.yml`, `.github/dependabot.yml` (new)
- `sdk/node/package.json`, `sdk/node/README.md`
- `lib/server/risk.ts`, `tests/unit/risk.test.ts` (new)
- `tests/integration/oauth-private-key-jwt.test.ts` (new)
- `tests/integration/webhook-delivery.test.ts` (new)
- `tests/integration/activation-expiry.test.ts` (new)
- `tests/integration/webhook-enqueue.test.ts`
- `tests/e2e/visual.spec.ts` (new)
- `worker.js`
- `db/migrations/013_webhook_auto_disable.sql` (new), `db/schema.sql`
- `lib/server/webhooks.ts`, `lib/server/repositories/webhooks.ts`
- `app/developers/apps/[slug]/actions.ts`, `app/developers/apps/[slug]/WebhookEndpointsSection.tsx`
- `docs/external-apps.md`, `README.md`

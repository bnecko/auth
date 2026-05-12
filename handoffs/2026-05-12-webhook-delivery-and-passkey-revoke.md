# Webhook delivery for activation lifecycle + passkey revoke + stabilization verification

**Date:** 2026-05-12
**Purpose:** Wire end-to-end webhook delivery so external apps no longer have to poll, close the passkey-revoke regression from the prior session, and verify the prior stabilization pass.

## Context

The prior pass left three things unverified or broken: the stabilization-pass diff was never exercised locally (only typecheck + tests ran, no Next.js build, no Playwright, no SDK build, no UI sweep); a "revoke" button was removed from `components/PasskeyManager.tsx` without backing it with a real delete path, so users had no way to revoke a passkey at all; and `docs/external-apps.md` promised server-to-server webhook delivery that did not exist — schema and signing infrastructure were present (`db/migrations/008_webhooks.sql`, `lib/server/webhooks.ts`, `lib/server/repositories/webhooks.ts`) but no worker delivered anything, and a schema bug stored only a hash of the webhook secret (so the server could not sign at retry time).

## What changed

**Verification of prior pass.** Ran `npm run typecheck`, `test:run`, `build`, `test:e2e`, plus the SDK install and build. Found one flake in `tests/unit/password.test.ts` (the tamper test flipped the last base64url char, which can be a no-op when only "padding" bits change); fixed by flipping the first char. 8 consecutive test runs now stable.

**End-to-end smoke fix (worker deadlock).** Initial smoke against the running Docker stack reproduced a deadlock: `worker.js` held a `SELECT … FOR UPDATE SKIP LOCKED` transaction across the HTTP call, while `deliverOne` opened a separate pool connection to UPDATE the same row — the inner UPDATE blocked on the outer txn's row lock, the outer txn never committed, and pg_stat_activity showed `idle in transaction` connections accumulating per poll tick. Fixed by dropping the outer transaction entirely (`worker.js:processWebhookBatch`) — single-worker deployment doesn't need `FOR UPDATE`. Left an inline comment with the atomic-claim pattern to use if multiple worker replicas are ever needed. Smoke now passes: delivery POSTed within 2 s, SDK `verifyWebhookSignature` accepts the signature, DB row reaches `delivered|1|200`.

**Smoke script** at `scripts/smoke-webhook.mjs` — kept in repo as a reusable end-to-end check. Requires the Docker stack to be running. Cleans up after itself.

**Passkey revoke.**
- `lib/server/repositories/webauthn.ts:99-107` — `deleteWebauthnCredential` now returns `boolean` via `returning id` so callers know whether anything was actually deleted.
- `app/dashboard-actions.ts` — new `revokePasskeyAction` mirrors `revokeSessionAction`; records `passkey_revoked` security event with IP/UA from `headers()` and credentialId metadata.
- `components/PasskeyManager.tsx` — re-introduced a `revoke` button per row as a server-action form. No confirmation modal (matches the existing session-revocation pattern). Server actions over a REST DELETE; this is a deliberate deviation from the plan's literal P2.1 because every other dashboard mutation in the codebase uses server actions.

**Webhook delivery for activation lifecycle.**
- `db/migrations/009_webhook_secret_plaintext.sql` *(new)* — renames `secret_hash` → `secret` (plaintext). Any pre-existing rows are disabled since their original secrets are unrecoverable. Schema-level `NOT NULL` was deliberately not added because it would have failed against legacy null rows; code-side invariant covers new inserts.
- `db/schema.sql` updated to match for fresh installs.
- `lib/server/webhooks.ts` — `webhookEventTypes` extended with `activation.{approved,denied,cancelled}`. New `WebhookEventType` union exported.
- `lib/server/services/activation.ts` — new private `fireActivationWebhook` helper (best-effort, try/catch wrapped so a webhook failure cannot roll back the user-authorized activation transition). Fired at three points: after `approveActivation` (with scopes, returnUrl, approvedUserId as the user's public id, app's public id), after `denyActivation`, and after `cancelActivation`. Failures record a `webhook_enqueue_failed` security event.
- `lib/server/repositories/webhooks.ts` rewritten: drops `hashToken` usage (column is now plaintext), adds admin/dev lifecycle functions — `listWebhookEndpointsForApp`, `findWebhookEndpointByPublicId`, `disableWebhookEndpoint`, `deleteWebhookEndpoint`, `findWebhookDeliveryByPublicId`, `listRecentWebhookDeliveries` (with optional status filter, joins app + endpoint), `retryWebhookDelivery` (sets pending + next_attempt_at=now). New `WebhookDelivery` / `WebhookDeliveryStatus` / `WebhookDeliveryRowForAdmin` types exported.
- `worker.js` — extended with a webhook delivery loop alongside the existing telegram BullMQ worker. Plain CommonJS (the Docker `worker` target does not build TypeScript). Polls every 1 s, batches up to 10 pending deliveries with a plain `SELECT` (no outer transaction — see "End-to-end smoke fix" in Context for why), signs each with `HMAC-SHA256(secret, "ts.body")` matching the SDK's `verifyWebhookSignature`, POSTs with a 5 s `AbortController` timeout, and on failure schedules a retry with exponential backoff (1m → 5m → 15m → 1h → 4h → 12h → 24h → `failed`). Response body truncated to 4 KB.
- `docker-compose.yml` worker service now receives `DATABASE_URL` and depends on `db: service_healthy`.
- `app/developers/apps/[slug]/actions.ts` — three new server actions: `createWebhookEndpointAction` (validates HTTPS, allows localhost in dev, returns the plaintext secret to the client once), `disableWebhookEndpointAction`, `deleteWebhookEndpointAction`. All gated by an `assertOwnsApp` helper.
- `app/developers/apps/[slug]/WebhookEndpointsSection.tsx` *(new)* — client component for listing, creating, disabling, deleting endpoints. One-time secret reveal in `<Alert tone="warning">` with the same copy used for bearer tokens.
- `app/developers/apps/[slug]/page.tsx` — fetches and renders the new section under `AppSettingsForm`.
- `app/admin/webhooks/page.tsx` *(new)* — admin observability table: last 200 deliveries with app, endpoint URL, event, status, attempt count, HTTP status, last error. Filter tabs for `all / pending / delivered / failed`. Per-row `retry` action for `failed` or `pending`.
- `app/admin/webhooks/actions.ts` *(new)* — `retryWebhookDeliveryAction` (admin role check, audit-logged).
- `components/AdminSidebar.tsx` — new `webhook deliveries` nav item.

**Tests.**
- `tests/unit/webhook-sign.test.ts` *(new)* — roundtrip test: the server's `signWebhookPayload` produces a digest the SDK's `verifyWebhookSignature` accepts. Tampered body, wrong timestamp, wrong secret all rejected. Pinned signature format prevents server/SDK drift.
- `tests/integration/webhook-enqueue.test.ts` *(new, DB-gated)* — `registerWebhookEndpoint` persists plaintext secret; `enqueueWebhookEvent` creates a delivery per matching active endpoint; endpoints subscribed to other event types are skipped; disabled endpoints are skipped.

**Docs.**
- `docs/external-apps.md` — removed "callback delivery is not implemented yet"; added a `Webhooks` section: event types, request format with full header list, body shape, signature verification with SDK example, retry/backoff table, idempotency guidance, replay-protection note.

**Misc.**
- `.gitignore` — added `sdk/*/dist/` so SDK build artifacts stay out of commits.

## What was NOT done

- `activation.expired` event. Requires a sweep job (cron or BullMQ repeatable) to detect activations past their `expires_at`. Plumbing is heavier than fits in this pass.
- Worker delivery integration test. Would need a local HTTP fixture + Redis. Sign-format drift is covered by the unit roundtrip test; actual delivery is only manually verified.
- DB-driven retry sweep. The polling worker is the only retry driver; if the worker is down, pending deliveries stack up but are not lost (next_attempt_at safety-net is checked on next start).
- Auto-disable endpoint after N consecutive failures. Endpoints stay active even when every delivery fails.
- Webhook secret rotation UI. Current model: `delete + re-register`.
- Generic event firing for `user.created`, `oauth.grant.created`, `token.revoked`, `subscription.changed`. The schema and event-type allowlist support these, but only `activation.*` fires.
- Python and Go SDK webhook helpers. The Node SDK already exports `verifyWebhookSignature`.
- Replay protection on the *receiver* side. Documented as guidance in `docs/external-apps.md` but not enforced anywhere.
- Bearer rotation flow ("I lost my key"). Still open from the prior pass.
- Other untouched security tests from the prior survey: `rateLimit`, session lifecycle, CSRF on form-POST endpoints, CSP nonce delivery, DCR, OAuth introspect/userinfo/revoke endpoint tests.
- Manual UI sweep at `npm run dev` (passkey revoke button, webhook endpoint flow, admin retry, search palette ARIA via screen reader). Build + e2e + typecheck cover correctness; visual polish is unverified.
- End-to-end webhook delivery test against a real receiver (request-bin or netcat). No real receiver was hit; only the local sign/verify roundtrip and DB-level enqueue is covered automatically.

## Verification

Run | Result
---|---
`npm run typecheck` | clean
`npm run test:run` | 45 passed / 16 skipped (stable across 8 runs after password-flake fix)
`npm run build` | clean (only inherited `url.parse()` deprecation warnings from internal deps); `/admin/webhooks` route registered
`npm run test:e2e` | 5 passed (Redis-not-running noise in stderr, did not affect tests)
`cd sdk/node && npm install && npm run typecheck && npm run build` | clean ESM + CJS + .d.ts in `sdk/node/dist/`
Migration 009 against the running dev DB | applied cleanly; `secret_hash` dropped, `secret` text column added, `schema_migrations` shows 009 at 2026-05-12 16:40 UTC
Worker end-to-end smoke (`node scripts/smoke-webhook.mjs`) | PASS — delivery POSTed within 2s, SDK verifies signature, row reached `delivered\|1\|200`
Manual UI sweep | not executed; user to do

End-to-end manual check, when the user has a moment:
1. `docker compose up --build` (worker now needs `DATABASE_URL` — already wired in compose).
2. Register an external app in the developer dashboard.
3. In that app's settings page, register a webhook endpoint pointing at e.g. `https://webhook.site/...` with `activation.approved` checked. Copy the revealed secret.
4. Trigger an activation via the SDK or `test.py`, approve it.
5. Verify the receiver got a POST with valid `x-bottleneck-signature` (use SDK's `verifyWebhookSignature` with the saved secret).
6. Confirm `webhook_deliveries` row reached `delivered` with a 2xx `response_status`.
7. Point the endpoint at a 500-returning URL, register again, approve. Watch the admin `/admin/webhooks` page show attempt 1 fail, see `next_attempt_at` advance per the retry table.

## Follow-ups

- Implement `activation.expired` via a BullMQ repeatable job or a per-minute sweep cron. The fire point is wherever the sweep marks `status='expired'`; reuse `fireActivationWebhook`.
- Add a worker integration test that boots a local HTTP server and exercises one delivery end-to-end. Vitest + supertest-like fixture; gate on `DATABASE_URL + REDIS_URL`.
- Implement webhook secret rotation: an "issue new secret" button on each endpoint card. Show new secret once; old secret stays valid for 7 days like the OAuth client secret rotation pattern in `lib/server/repositories/externalApps.ts:rotateExternalAppOAuthSecret`.
- Build a per-endpoint deliveries view (`/admin/webhooks/<endpoint-public-id>`) for debugging a single endpoint's failure stream.
- Add auto-disable on N consecutive failures (5 is a reasonable threshold) with a notification to the app owner.
- Decide on `webhooks/` commit policy: `docs/prompts/handoff.md` says do not commit the handoff in the same commit as code, but does not say whether `handoffs/` should be tracked at all. Currently not in `.gitignore`. Recommend tracking — handoffs are a team ledger.

## Files touched

Modified:
- `.gitignore`
- `app/api/activation-requests/[id]/route.ts` *(profile always-present — from prior pass, included for diff stability)*
- `app/api/bearer-requests/[id]/reveal/route.ts`, `app/api/bearer-requests/[id]/route.ts` *(prior pass)*
- `app/dashboard-actions.ts`
- `app/developers/apps/[slug]/actions.ts`
- `app/developers/apps/[slug]/page.tsx`
- `app/{activate,device,expired,forgot,forgot/reset,login,login/telegram,oauth/authorize,register,relink,verify}/page.tsx` *(prior pass — title size)*
- `components/AdminSidebar.tsx`
- `components/BearerSection.tsx`, `components/PasskeyManager.tsx`, `components/Section.tsx`, `components/Sidebar.tsx`
- `db/schema.sql`
- `docker-compose.yml`
- `docs/external-apps.md`, `docs/master.md`
- `lib/server/repositories/bearerRequests.ts` *(prior pass)*
- `lib/server/repositories/webauthn.ts`
- `lib/server/repositories/webhooks.ts`
- `lib/server/services/activation.ts`
- `lib/server/services/bearer.ts` *(prior pass)*
- `lib/server/webhooks.ts`
- `sdk/node/package.json`, `sdk/node/src/index.ts`
- `tsconfig.json`
- `worker.js`

New:
- `app/admin/webhooks/page.tsx`
- `app/admin/webhooks/actions.ts`
- `app/developers/apps/[slug]/CopyValue.tsx` *(prior pass)*
- `app/developers/apps/[slug]/WebhookEndpointsSection.tsx`
- `db/migrations/009_webhook_secret_plaintext.sql`
- `handoffs/2026-05-12-webhook-delivery-and-passkey-revoke.md` *(this file)*
- `scripts/smoke-webhook.mjs`
- `sdk/node/README.md`, `sdk/node/tsconfig.json`, `sdk/node/tsup.config.ts`, `sdk/node/package-lock.json`
- `sdk/node/src/{activation,errors,pkce,types}.ts`
- `tests/integration/activation-requests.test.ts`, `tests/integration/oauth-token.test.ts`, `tests/integration/webhook-enqueue.test.ts`
- `tests/unit/password.test.ts`, `tests/unit/telegram.test.ts`, `tests/unit/webhook-sign.test.ts`

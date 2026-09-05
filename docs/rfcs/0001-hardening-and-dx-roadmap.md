# RFC 0001: Hardening and developer-experience roadmap

**Status:** Draft
**Date:** 2026-08-28
**Author:** Matthew Demidoff

## Summary

A prioritized roadmap for the next round of work: make the data durable,
give the worker and queue path real CI coverage, pay down the largest
code-health debts, and finish or cull the half-built features. Nothing
here changes product behavior; each item is an independent workstream
that can land as its own PR.

## Motivation

The service is in production and other applications depend on it for
sign-in. The code-level discipline (migrations, tests, CI gates) is
ahead of the operational story: everything runs on a single host, the
queue worker is the least-tested component, and a few features exist
only as schema plus read paths. This RFC exists to agree on the order
of work before any of it starts.

## Proposal

Ordered by risk reduction per unit of effort.

### 1. Automated offsite database backups plus a restore drill

The postgres volume is the only copy of every account. Add a scheduled
dump (or WAL archiving) shipped to offsite object storage, with
retention, and a documented, rehearsed restore path in runbooks/.
No other item on this list matters if this one is missing.

### 2. Queue coverage in CI

The verify job has no Redis service, so the bullmq path is only ever
compile-checked; the recent bullmq 6 major went out with a manual local
smoke as the sole runtime proof. Add a Redis service to CI and an
integration test that does an enqueue -> worker -> completed/failed
round trip against the real queue.

### 3. Worker hardening

worker.js is ~800 lines of untyped JS shipped alone into its own image
with a hand-maintained env contract. Move it to type-checked TS (or
checkJs), share the config validation with the app where the contracts
overlap, and add a test that asserts the worker boots with exactly the
env the compose file provides.

### 4. Typed server-action results

Actions currently throw Error and the UI renders err.message. Production
builds mask thrown action messages, so real deployments degrade to
generic errors. Migrate mutating actions to typed { ok } | { error }
returns; the forms already have the state handling to render them.

### 5. Split lib/server/services/oauth.ts

At ~1400 lines it now covers authorize, token, client auth, metadata,
and userinfo. Split by responsibility (behavior-preserving, its own PR,
no logic changes) so future security-sensitive diffs stay reviewable.

### 6. Finish or cull half-built features

- subscriptions: read, enforce, and revoke exist but nothing creates a
  row. Decide: admin grant UI as the origination path, or drop the tab
  until billing exists.
- TERMS_VERSION: stored on acceptance but never re-checked. Add the
  re-acceptance flow or remove the version gate.
- ioredis exact pin: bullmq 6 made ioredis an optional peer dependency,
  so the historical reason for the exact 5.11.1 pin is gone; relax to a
  caret range in a routine dependency PR.

### 7. Security review backlog

Findings from the private security review remain triaged outside this
repository and are intentionally not enumerated here. Schedule them as
their own hardening pass after items 1 and 2.

## Alternatives considered

- Track all of this as issues instead: scatters the ordering discussion
  and loses the single reviewable artifact.
- A larger infra migration (managed Postgres, split hosts): more
  durable long-term, but item 1 delivers most of the risk reduction now
  and does not preclude it.

## Open questions

- Backup target and tooling: plain pg_dump on a schedule vs WAL-G, and
  which object store.
- Is a staging environment worth running on the current footprint, or
  is the scratch-database dev flow enough for now?

## Addendum: expansion vectors

Candidates that surfaced while scoping items 1-7. None are committed;
each is a one-line pointer so the ordering discussion stays in this
document. Within each group, ordered by risk reduction per unit of
effort, as above. Items marked (landed) merged while this RFC was in
review.

### Top picks

1. Capture unhandled errors structurally: onRequestError, error
   boundaries, pool and process 'error' handlers, stacks in log lines.
   (landed)
2. Add an external uptime probe and a dead-man's switch so a dead host,
   tunnel, worker, or bot is noticed from outside the host.
3. Rewrite host secret handling: env file outside the checkout, tunnel
   token via environment, a per-secret rotation matrix that names each
   secret's consumers, restart set, and overlap procedure.
4. Add a release-age cooldown to Dependabot updates. (open PR)
5. Add an authorization-matrix regression test over every route handler
   and server action, with an explicit allowlist for public endpoints.
6. Boot the production runner image in CI and run Playwright against it
   instead of the dev server; requires the Redis service from item 2.
7. Encrypt offsite backups and escrow what a dump does not contain: the
   signing key and the env file, without which a restore cannot issue
   tokens.
8. Generalize operator alerting beyond webhook events and send a daily
   digest, so a dead alert channel is itself visible.

### Further vectors

Observability:
- Bound and instrument outbound vendor calls (Telegram, Resend,
  Turnstile) with one timeout-carrying helper.
- Carry the request id into security events and emit one completion line
  per API request.
- Harden the bot loop: backoff, timeouts, structured logs, and a
  healthcheck.
- Extend runbooks/oncall.md to the bot, a stuck worker, vendor outages,
  Redis, disk, and key rotation.
- Define SLIs and threshold alerts from data the service already
  records.
- Turn on Postgres query observability and per-process application_name.
- Add runtime kill switches: pause registration, pause issuance, revoke
  all sessions.

Testing and CI:
- Add an authenticated end-to-end journey to the Playwright suite.
- Run the published SDK against the real server as a CI contract test.
- Integration-test the login and registration policy in
  services/auth.ts.
- Unit-test the security-boundary helpers that have no tests.
- Assert schema equivalence between the fresh-migration and schema.sql
  upgrade paths.
- Add a lint gate to CI.
- Run the OpenID conformance suite against an ephemeral stack before the
  oauth.ts split, as its behavior oracle.
- Bring bot/ and scripts/ under CI.

Supply chain and deploy:
- SHA-pin actions; add CodeQL and secret scanning; use a least-privilege
  token.
- Track container base images with Dependabot and pin by digest.
- Build and publish images from CI; deploy by tag instead of rebuilding
  on the host.
- Codify the deploy as pre-flight, migrate, health gate, roll back on
  failure.
- Lint the environment contract across code, compose, and .env.example;
  extend boot-time validation from presence to shape.
- Fence production from the dev tooling that shares its host.
- Harden the migration runner: advisory lock, statement timeouts, no
  crash loop on failure.

Secrets and resilience:
- OIDC signing-key rotation tooling, age tracking, and a documented
  overlap procedure.
- Define and test the Redis-unavailable behavior of every auth-critical
  path; add command and connect timeouts to the app Redis client.
- Cache discovery and JWKS responses; memoize session resolution per
  render and throttle the last_seen_at write.
- Compose hardening: file-backed secrets, network segmentation, Redis
  auth and maxmemory, uniform container flags.
- Account for the proxy's own pg pool in the connection budget; bound
  webhook delivery concurrency in the worker.

Sign-in hardening:
- Issue one-time recovery codes as an offline second-factor fallback.
- Centralize rate-limit policy and cover the remaining unauthenticated
  OAuth and WebAuthn entry points; key OAuth limits per client_id.
- Bound request body size in requestBody().
- Raise the scrypt work factor to the current floor and rehash on login.
- Treat a denied sign-in prompt as a compromise signal; cap outstanding
  prompts per account.
- Show device and location context in approval prompts and the session
  list.
- Bring the Telegram Login Widget sign-in path to parity or remove it.
- Require user verification for passkey sign-in; persist backup flags.
- Add CSP violation reporting; tighten response headers and the session
  cookie.
- Put every one-time-code check behind one hardened helper.

OAuth protocol and integrator contract:
- Reconcile the activation status, list, and webhook payload contract.
- Webhook self-service for app owners: delivery log, redeliver, test
  event, re-enable; retire callbackUrl.
- Make public clients usable: CORS on token/userinfo/jwks,
  WWW-Authenticate, userinfo POST.
- Standardize 429 and error envelopes across OAuth and activation
  endpoints; cursor pagination and strict idempotency on the activation
  API.
- Give dynamically registered clients an owner and a management surface
  (RFC 7592).
- Add ID-token verification, discovery, and a webhook parser to the SDK.
- Emit or remove the four reserved webhook event types; emit
  grant-revocation events for user, owner, and admin revocations.
- Skip consent for already-granted scopes; make prompt=none silent.
- Let app owners choose client type and token-endpoint auth method with
  least-privilege defaults.
- Define the resource-server story: document access-token claims and
  allow a registered resource server to introspect.
- Publisher identity on the consent screen: client metadata and a
  verified tier.
- Implement OIDC back-channel logout with a sid claim.
- Support loopback redirects with a variable port (RFC 8252) and
  private-use schemes.
- Publish a server API changelog and a deprecation policy.

Account lifecycle and privacy:
- Add a transaction helper and wrap multi-statement writes.
- Add retention sweeps for the tables the hourly hygiene loop skips.
- Complete the account data export and remove the 100-event cap.
- Extend user notifications beyond four Telegram-only events; add an
  email fallback; notify support thread participants on replies.
- Show app status and last use on the Connected apps page.
- Make the user activity trail readable, complete, and paginated.

UI and accessibility:
- Add mobile navigation to the account and admin shells.
- Replace the three hand-rolled overlays with one focus-managed dialog.
- Require confirmation for secret rotation and webhook disable/delete.
- Make the shared Row grid and dense list rows responsive.
- Route-level error boundaries inside the app shell. (landed)
- Automate the accessibility bar: axe in e2e, a mobile viewport project.
- Extend the Field primitive to textarea, select, and checkbox.
- Mark the current page, add a skip link, name icon-only controls.

Documentation:
- Document shipped contract features missing from the integrator docs.
- Fix the public docs index and remove references to ignored paths.
- Document the worker's sweep loops and the data-retention contract.
- Publish security.txt and complete the disclosure policy in
  SECURITY.md.
- Replace the design-era stack docs with a current architecture
  overview.
- Make docs/ the single source for developer docs.
- Add CONTRIBUTING.md with a real local-dev path.

### Private security backlog

Findings from the private security review are tracked outside this
repository and are intentionally not enumerated here (see item 7).
Everything in this addendum is limited to work that is safe to discuss
in public.

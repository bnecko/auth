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

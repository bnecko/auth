# Prompt Library — Master Index

This file describes every prompt in `docs/` and tells you when to load each one. Load only what is relevant to the task at hand. Loading everything at once dilutes attention and produces generic output.

Universal prompts (applicable to any professional project) live in `docs/prompts/`. Project-specific reference docs live in `docs/`.

---

## Always load

These apply to every session regardless of task.

### [`prompts/anti-slop-coding-prompt.md`](prompts/anti-slop-coding-prompt.md)
The baseline coding behavior contract. Defines how to write code that reads like a human developer wrote it: no over-engineering, no defensive bloat, no tutorial-style comments, no AI tells. Load this at the start of every session where code will be written or modified.

### [`prompts/code-style.md`](prompts/code-style.md)
File structure, function size, naming conventions, abstraction threshold, and comment rules. The core answer to "how should this code be organized and written." Load alongside `anti-slop-coding-prompt.md` for any coding session.

### [`prompts/pre-public-hygiene.md`](prompts/pre-public-hygiene.md)
Pre-commit and pre-push checklist. Strips AI artifacts, scans for secrets and debug leftovers, verifies commit metadata. Load before any `git commit` or `git push`. Run silently — do not announce the steps.

---

## Load for specific task types

### [`prompts/investigation.md`](prompts/investigation.md)
Load when debugging, diagnosing a reported bug, or starting work on unfamiliar code. Covers reproducing before patching, finding the root cause vs the symptom, tracing data flow, using `git log`/`git blame`, and when to stop and ask. Load this before reaching for any "fix."

### [`prompts/api-design.md`](prompts/api-design.md)
Load when designing or modifying HTTP endpoints, REST APIs, or request/response contracts. Covers response shape consistency, HTTP method semantics, naming, idempotency, status codes, and pagination. Use before writing a new route or reviewing an existing API for consistency.

### [`prompts/error-handling.md`](prompts/error-handling.md)
Load when writing any code that handles failures: route handlers, service functions, external calls, or anything with a try/catch. Covers when to catch vs propagate, what to return to clients, what to log, HTTP semantics, and consistent error shapes.

### [`prompts/logging.md`](prompts/logging.md)
Load when adding log lines, designing observability for a new feature, or cleaning up noisy logs. Covers log levels, structured fields, the "2am test," correlation IDs, hot-path performance, and when to reach for a metric or trace instead. Companion to `error-handling.md §What to log`.

### [`prompts/testing.md`](prompts/testing.md)
Load when writing or reviewing tests, or fixing a bug that needs a regression test. Covers when a test is worth writing, the unit/integration boundary, what to mock (almost nothing) and what not to, the shape of a good test, and quality smells (flakes, over-mocking, `toHaveBeenCalled` as the only assertion).

### [`prompts/refactoring.md`](prompts/refactoring.md)
Load when restructuring existing code without changing behavior. Covers when to refactor (and when not to), the rule of three, refactoring as a separate PR, behavior-preserving discipline, safe deletion, and common bad refactors to avoid.

### [`prompts/dependencies.md`](prompts/dependencies.md)
Load when adding, updating, or removing a package. Covers the inline-vs-depend decision, evaluating a candidate (maintenance, transitive footprint, license, security history), lockfile hygiene, update cadence, and supply-chain risks.

### [`prompts/pr-universal-prompt.md`](prompts/pr-universal-prompt.md)
Load when opening a pull request, writing commit messages, or preparing a diff for push. Covers PR scope discipline (one concern per PR), commit message conventions, description style, and how to handle review feedback. Author-side counterpart to `code-review.md`.

### [`prompts/code-review.md`](prompts/code-review.md)
Load when reviewing someone else's PR, or self-reviewing your own diff before merge. Covers what to actually look at (logic, contracts, security, error paths, tests) and what to ignore (formatting, taste), how to label blocking vs non-blocking comments, and disagreement etiquette.

### [`prompts/security-audit.md`](prompts/security-audit.md)
Load when doing a focused security review of a codebase, feature, or PR. Covers authentication flaws, injection vectors, token handling, rate limiting gaps, and session management issues. Not for general coding — this is a dedicated review lens.

### [`prompts/handoff.md`](prompts/handoff.md)
Load at the end of a session that made a major change (feature shipped across >3 files, security/contract/migration change, SDK version bump, or an unfinished task). Writes a `handoffs/YYYY-MM-DD-<slug>.md` at repo root so the next person can pick up cold. Also load at the *start* of any non-trivial task to read the most recent handoff for context.

---

## Situational prompt library

A library of narrow, situation-triggered prompts lives at [`prompts/lib/`](prompts/lib/index.md), organized by topic. Each prompt is for a specific moment that needs its own discipline. Load only the one that matches; do not load the whole library at once.

Topics (see [`prompts/lib/index.md`](prompts/lib/index.md) for full per-prompt descriptions):

- [`lib/incidents/`](prompts/lib/incidents/) — production failures and their response. `incident`, `postmortem`, `revert`, `hotfix`, `cve-response`, `secret-leak`.
- [`lib/investigation/`](prompts/lib/investigation/) — finding what is wrong. `bisect`, `flaky-test`, `performance-bug`, `memory-leak`.
- [`lib/planning/`](prompts/lib/planning/) — deciding before building. `spike`, `adr`, `rfc`.
- [`lib/lifecycle/`](prompts/lib/lifecycle/) — project lifecycle moments. `onboarding`, `deprecation`, `release`, `pr-too-big`, `merge-conflict`.
- [`lib/data/`](prompts/lib/data/) — schema and data operations. `db-migration`, `backfill`.
- [`lib/ops/`](prompts/lib/ops/) — operational discipline. `rollback`, `feature-flag`, `runbook`, `vendor-outage`, `load-test`.

---

## Reference docs (load when working in that domain)

These describe this project's own systems. Load when an agent needs domain context, not behavioral guidance.

### [`backend-stack.md`](backend-stack.md)
Stack overview: database, Redis, queue, session management, and service layer patterns. Load when starting work on backend services, adding a new data model, or integrating a new dependency.

### [`oauth.md`](oauth.md)
OAuth 2.1 and OIDC implementation reference. Covers flows, endpoints, token formats, scopes, and client registration. Load when working on anything that touches authorization, token issuance, or client management.

### [`external-apps.md`](external-apps.md)
How external applications integrate with the auth service. Load when building or reviewing client-side integrations, SDK work, or developer-facing features.

### [`ui-ux.md`](ui-ux.md)
UI direction, component patterns, and visual conventions. Load when working on frontend pages, new components, or layout changes.

### [`infra-outline.md`](infra-outline.md)
Expansion map for infrastructure beyond the current auth service. Load when planning new services, evaluating where new functionality should live, or making architectural decisions that span systems.

---

## Do not load

- Do not load reference docs for tasks that do not touch that domain (e.g. do not load `oauth.md` when fixing a UI bug).
- Do not load `security-audit.md` during normal feature work — it shifts focus toward finding problems rather than building things.
- Do not load everything at once. Prompts are most effective when they are specific to the work being done.

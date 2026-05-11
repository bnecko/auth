# Prompt Library — Master Index

This file describes every prompt in `docs/` and tells you when to load each one. Load only what is relevant to the task at hand. Loading everything at once dilutes attention and produces generic output.

---

## Always load

These apply to every session regardless of task.

### [`anti-slop-coding-prompt.md`](anti-slop-coding-prompt.md)
The baseline coding behavior contract. Defines how to write code that reads like a human developer wrote it: no over-engineering, no defensive bloat, no tutorial-style comments, no AI tells. Load this at the start of every session where code will be written or modified.

### [`code-style.md`](code-style.md)
File structure, function size, naming conventions, abstraction threshold, and comment rules. The core answer to "how should this code be organized and written." Load alongside `anti-slop-coding-prompt.md` for any coding session.

### [`pre-public-hygiene.md`](pre-public-hygiene.md)
Pre-commit and pre-push checklist. Strips AI artifacts, scans for secrets and debug leftovers, verifies commit metadata. Load before any `git commit` or `git push`. Run silently — do not announce the steps.

---

## Load for specific task types

### [`api-design.md`](api-design.md)
Load when designing or modifying HTTP endpoints, REST APIs, or request/response contracts. Covers response shape consistency, HTTP method semantics, naming, idempotency, status codes, and pagination. Use before writing a new route or reviewing an existing API for consistency.

### [`error-handling.md`](error-handling.md)
Load when writing any code that handles failures: route handlers, service functions, external calls, or anything with a try/catch. Covers when to catch vs propagate, what to return to clients, what to log, HTTP semantics, and consistent error shapes.

### [`pr-universal-prompt.md`](pr-universal-prompt.md)
Load when opening a pull request, writing commit messages, or reviewing a diff before pushing. Covers PR scope discipline (one concern per PR), commit message conventions, description style, and how to handle review feedback.

### [`security-audit.md`](security-audit.md)
Load when doing a focused security review of a codebase, feature, or PR. Covers authentication flaws, injection vectors, token handling, rate limiting gaps, and session management issues. Not for general coding — this is a dedicated review lens.

---

## Reference docs (load when working in that domain)

These describe the project's own systems and are loaded when an agent needs domain context, not behavioral guidance.

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

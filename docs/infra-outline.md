# Bottleneck Infrastructure Outline

This is the expansion map for Bottleneck beyond the current auth service. It is
not wired into the runtime yet.

## Core Domains

- Identity: users, sessions, passkeys, Telegram 2FA, recovery.
- OAuth: clients, grants, tokens, consent, device flow, PAR, DCR.
- Organizations: orgs, teams, members, invitations, roles.
- Projects: app groups owned by orgs, with dev/staging/production environments.
- Entitlements: products, plans, subscriptions, quotas, and feature flags.
- Gateway: token verification, introspection, rate limits, and abuse controls.
- Webhooks: signed events, retries, replay, and event subscriptions.
- Audit: immutable security and admin event history.
- Risk: scoring, anomaly detection, and step-up decisions.

## First Structures

- `organizations`
- `organization_members`
- `projects`
- `project_environments`
- `entitlement_plans`
- `entitlement_assignments`
- `api_gateway_routes`
- `api_usage_counters`
- `webhook_endpoints`
- `webhook_deliveries`

## Boundaries

The auth service remains the source of truth for identity, OAuth clients, token
signing, sessions, and user consent. Future gateway and entitlement services
should consume auth through JWKS, introspection, and signed webhooks rather than
sharing session state.

## Release Track

- `bn-oauth-2026-05`: current OAuth profile.
- `bn-oauth-2026-01`: legacy compatibility profile for downgrade support.

Stable versions should be tagged only after migrations, Docker build, typecheck,
unit/integration tests, e2e tests, and migration smoke pass.

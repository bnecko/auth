# OAuth/OIDC Conformance + Pen Test Runbook

This document is a one-page checklist for the two production-readiness steps
that cannot be completed from inside the repo — they need a public staging
URL, a third-party portal account, or a security vendor. Run both after each
major OAuth change.

## Pre-flight

Both runs need a stable, publicly reachable HTTPS endpoint that points at a
deploy of this code with all migrations applied. The Cloudflare Tunnel that
fronts production is fine; a dedicated staging tunnel is cleaner because it
keeps test clients off the production data and lets the conformance suite
issue probes without contaminating audit logs.

Required state at the staging URL:
- `/.well-known/openid-configuration` returns JSON
- All scopes listed in `scopes_supported` are accepted
- `token_endpoint_auth_methods_supported` includes the method you want to
  certify with (typically `client_secret_basic` + `private_key_jwt`)
- A test user exists (registration is open or seeded via the admin UI)
- OAuth client registration is enabled (either through DCR with a known
  bearer token or admin-created clients)

## OpenID Conformance Suite

The conformance suite is run from a hosted portal — you do not install anything.

**Where:** https://www.certification.openid.net/

**Steps:**

1. Create an account at the conformance portal.
2. Create a *test plan* targeting the staging URL. The portal will ask for
   the discovery URL (`https://<staging>/.well-known/openid-configuration`)
   and surface the redirect URIs the suite will use for its synthetic clients
   — register those redirect URIs on the matching OAuth client before
   starting the run.
3. Run, in order:
   - **OpenID Connect Basic OP** — code flow, ID token issuance, userinfo.
   - **OAuth 2.0 / 2.1 Baseline** — token endpoint behaviour and PKCE.
   - **OpenID Connect RP-Initiated Logout 1.0** — `end_session_endpoint`,
     `id_token_hint`, `post_logout_redirect_uri` allowlisting.
   - **OpenID Connect Pushed Authorization Request** — PAR is wired; this
     run confirms the contract.
   - **`private_key_jwt` Client Authentication** — uses the
     `client_assertion` path against the token endpoint.
4. The portal reports green/yellow/red per assertion. Fix any red items by
   adjusting code, redeploy, re-run the failing plan. Yellow is usually OK
   for non-mandatory features.
5. Archive the green report PDF — it is the formal artifact for customer
   compliance reviews.

Typical first-run failures and where they live in this repo:

- *Missing claim X in `claims_supported`* → `oauthServerMetadata` in
  `lib/server/services/oauth.ts`.
- *`id_token_signing_alg_values_supported` mismatch* → same file.
- *`token_endpoint_auth_methods_supported` does not advertise X* → same file.
- *`end_session_endpoint` redirect not following spec* →
  `app/api/oauth/logout/route.ts`.
- *PKCE plaintext accepted* → it never is; the suite probably needs a
  different test client config.

## Penetration test

**Scope to hand the vendor:**

- `/oauth/authorize` (consent page, CSRF on approve/deny)
- `/api/oauth/token` (all grant types, including `private_key_jwt`)
- `/api/oauth/userinfo`
- `/api/oauth/introspect`
- `/api/oauth/revoke`
- `/api/oauth/par`
- `/api/oauth/logout`
- `/api/oauth/register` (DCR)
- `/api/oauth/reauth`
- Session cookie handling
- Webhook signature verification (`X-Bottleneck-Signature`)
- Activation broker flow (`/api/activation-requests/*`)

**Out of scope:** denial-of-service, social engineering, physical, Cloudflare
Tunnel internals, the bot or worker container at the Telegram boundary.

**Engagement shape:** targeted 5–7 day external assessment of the staging
deploy. Provide:
- 2 test user accounts (one active, one banned)
- 1 confidential OAuth client (client_secret_basic) with a known secret
- 1 public client (PKCE only)
- 1 `private_key_jwt` client with a published JWKS
- Read access to `docs/oauth.md`, `docs/external-apps.md`, and the latest
  handoffs under `handoffs/`

**Re-run trigger:** after each pass that touches the OAuth / OIDC surface,
the webhook delivery worker, the consent form, or any cryptographic
boundary. A small subset of the previous report can usually be re-tested.

## What "production-ready" means in this repo

Combination of: every code-level OAuth gap closed (this codebase is there
after the May 12 passes), at least one full green run of the basic OIDC
conformance plans, and one external pen test report with no unresolved
high-severity findings. The first two are gated by ops/process work that
lives outside this repo; the third sets up like a normal SOC 2-style
engagement.

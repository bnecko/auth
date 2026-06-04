# Bottleneck Auth

[![security](https://github.com/bnecko/auth/actions/workflows/security.yml/badge.svg)](https://github.com/bnecko/auth/actions/workflows/security.yml)

A self-hostable identity provider. It issues OAuth 2.0 and OpenID Connect
tokens, signs in users with passwords plus passkeys or Telegram as a second
factor, and brokers an activation flow that lets a separate app ask a user to
approve access to their profile. Bottleneck runs it as the identity service
for its own apps; this repository is that service.

It is a real implementation rather than a token library: discovery, JWKS, PKCE,
pushed authorization requests, the device flow, dynamic client registration
behind admin approval, refresh-token rotation with reuse detection, and
RP-initiated logout are all wired up and exercised in CI.

## What it does

- Authorization Code flow with PKCE (`S256` required), refresh tokens,
  client credentials, and the device flow.
- OIDC discovery, a published JWKS, RS256 ID tokens, UserInfo, token
  introspection and revocation, pushed authorization requests, and
  RP-initiated logout.
- Dynamic client registration gated behind a registration token and admin
  approval, so a self-registered client cannot complete a flow until a human
  approves it.
- Password login with passkeys (WebAuthn) or Telegram as a second factor.
- An activation broker: an external app creates an activation request with a
  bearer API key, the user approves it in the browser, and the app polls for
  the resulting profile.
- Signed webhooks for activation and token lifecycle events, delivered by a
  background worker with retry and backoff.

See [`docs/conformance.md`](docs/conformance.md) for the endpoint list and an
honest account of what is and is not implemented, and
[`SECURITY.md`](SECURITY.md) for the cryptographic and session decisions.

## What it does not do

- RS256 only. No ES256, EdDSA, DPoP, or mTLS-bound tokens.
- No implicit or hybrid flows; `response_type=code` only.
- The `bn-oauth-2026-05` and `bn-oauth-2026-01` profile tags behave
  identically today. The field is reserved for a future divergence, not a
  current behavior switch.
- No OpenID Foundation conformance suite run has been published.

## Architecture

- Next.js 16 (App Router) for the UI, route handlers, and the OAuth endpoints.
- Postgres for users, clients, tokens, sessions, and audit events; schema in
  `db/schema.sql`, migrations in `db/migrations`.
- Redis for rate limiting and short-lived challenges.
- A BullMQ worker (`worker.js`) for Telegram notifications and webhook
  delivery.
- Security headers are attached in `proxy.ts` (the Next.js middleware file);
  it sets the CSP nonce, HSTS, and framing controls on every response.

## Run it locally

```sh
cp .env.example .env
docker compose up --build
```

Set `POSTGRES_PASSWORD`, `OIDC_PRIVATE_KEY_PEM`, and `OAUTH_CSRF_SECRET`
before starting. The app listens on port 3000 inside the Compose network. For
the Cloudflare Tunnel setup, host tuning, and the full environment list, see
[`docs/deployment.md`](docs/deployment.md).

## Testing

```sh
npm run test:run
```

The unit suite runs without external services. The integration suites are
gated on `DATABASE_URL` and skip loudly without it; point them at a throwaway
Postgres to run them:

```sh
docker run -d --name auth-test-db -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16-alpine
export DATABASE_URL="postgres://postgres:postgres@localhost:5433/postgres"
export OIDC_PRIVATE_KEY_PEM="$(openssl genrsa 2048 2>/dev/null)" OIDC_KEY_ID=test
npm run migrate && npm run test:run
```

CI (`.github/workflows/security.yml`) runs the unit and integration suites,
the Playwright end-to-end scenarios against a Postgres service, `npm audit`,
the migration smoke test, the production build, and both Docker image builds
on every push. The `sdk` job separately builds and type-checks the Node SDK.

The activation flow can be exercised end to end with `test.py`. Set
`TEST_BEARER` to an external app's API key in `.env`, then run `python
test.py`; it creates an activation request, prints an approval URL, and polls
for the profile.

## Documentation

- [`docs/conformance.md`](docs/conformance.md): OAuth and OIDC self-assessment.
- [`docs/backend-stack.md`](docs/backend-stack.md): architecture, domain
  boundaries, and database schema.
- [`docs/oauth.md`](docs/oauth.md): Authorization Code plus PKCE integration
  guide.
- [`docs/external-apps.md`](docs/external-apps.md): integrating an external
  app with the activation API.
- [`docs/deployment.md`](docs/deployment.md): Compose, tunnel, and host setup.

## License

Apache-2.0. See [`LICENSE`](LICENSE).

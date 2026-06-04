# Deployment

The reference deployment runs the Compose stack on a single small host behind
a Cloudflare Tunnel. The app is not published on a host port; the tunnel
connects to it inside the Compose network.

## Required environment

Copy `.env.example` to `.env` and set at least:

- `POSTGRES_PASSWORD`
- `OIDC_PRIVATE_KEY_PEM` (an RSA private key; `OIDC_KEY_ID` to name it)
- `OAUTH_CSRF_SECRET` (required in production; generate with
  `openssl rand -hex 32`)
- `CLOUDFLARED_TOKEN` (only for the tunnel)

If `TURNSTILE_SECRET_KEY` is set, also set `TURNSTILE_SITE_KEY` and
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`; the forms fetch the site key at runtime. In
production a missing Turnstile secret fails closed.

## Cloudflare Tunnel

In the tunnel's public hostname settings, point the service at the app inside
the Compose network:

```text
Service: http://app:3000
```

## Database and migrations

The schema is loaded from `db/schema.sql` on first Postgres startup. Existing
databases are migrated at app startup from `db/migrations`. New installs also
run an idempotent initial migration, so CI and app startup exercise the
migration path on an empty database.

## Resource profile

The default Compose file is tuned for a small always-on host:

- app: 384 MB, Node old-space capped at 256 MB
- Postgres: 512 MB, 30 connections, small working memory
- cloudflared: 128 MB

Raise `DATABASE_POOL_MAX` and `APP_NODE_OPTIONS` only if traffic requires it.

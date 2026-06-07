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

## Health checks

- `GET /api/health` — liveness. Static 200, no I/O. Use it to tell if the
  process is up.
- `GET /api/health/ready` — readiness. Pings Postgres and Redis with a short
  timeout; returns 200 only when both are reachable, otherwise 503 with a body
  naming the failed dependency (`{"ok":false,"failed":["redis"]}`). The Compose
  app healthcheck targets this so the stack does not treat a database/redis
  outage as healthy.

## Graceful shutdown

On `SIGTERM`/`SIGINT` the worker stops scheduling new work, lets the in-flight
webhook batch drain (up to `GRACEFUL_SHUTDOWN_TIMEOUT_MS`, default 10s), then
closes the Postgres pool and Redis connection before exiting. The Next.js app
drains in-flight requests on `SIGTERM` itself. Both sides are restart-safe: a
hard kill mid-delivery is recovered via `webhook_deliveries.next_attempt_at`,
so `docker compose up -d --build app worker` is safe at any time.

## Operator alerts

Set `ALERT_TELEGRAM_CHAT_ID` (falls back to `BEARER_ADMIN_TELEGRAM_ID`) to get a
Telegram message when a webhook endpoint is auto-disabled or an enqueue fails.
Alerts are rate-limited and no-op outside production or without a chat id.

## Backup and restore

Postgres holds all durable state (users, sessions, OAuth clients/tokens,
activations, webhooks, security events). Redis is ephemeral (rate-limit
counters, short-lived challenges) and does not need backup.

Back up with a logical dump against the Compose db service:

```sh
docker compose exec -T db pg_dump -U auth -d auth -Fc > backup-$(date +%F).dump
```

Restore into a fresh database (stop the app/worker first so nothing writes
mid-restore):

```sh
docker compose stop app worker
docker compose exec -T db pg_restore -U auth -d auth --clean --if-exists < backup-YYYY-MM-DD.dump
docker compose up -d app worker
```

Run a restore drill periodically against a throwaway database
(`createdb`/`pg_restore -d`) so the dumps are known-good before you need them.
Schedule the `pg_dump` from cron on the host and ship the dump off-box.

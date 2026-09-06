# Deployment

The reference deployment runs the Compose stack on a single small host behind
a Cloudflare Tunnel. The app is not published on a host port; the tunnel
connects to it inside the Compose network.

## Environment file

Production secrets live outside the checkout, in a directory only the deploying
user can read:

```text
~/.config/bottleneck-auth/           # mode 0700
    prod.env                         # mode 0600, the values from .env.example
    oidc-private.pem                 # if the OIDC key is kept as a file
    oidc-public.pem
```

Compose finds the file through `COMPOSE_ENV_FILES`, exported once in the
deploying user's shell:

```sh
export COMPOSE_ENV_FILES="$HOME/.config/bottleneck-auth/prod.env"
```

Every `docker compose` command then reads it. Without the export, the first
`${POSTGRES_PASSWORD:?...}` interpolation fails closed with "set
POSTGRES_PASSWORD" rather than silently using stale values; the per-command
form is `docker compose --env-file "$HOME/.config/bottleneck-auth/prod.env"
...`. A `.env` in the repo root is not used and should not exist there: it is
readable by anything with the checkout, and `docker compose config` prints
every value it resolves, so run that with `--quiet` on the host.

Moving an existing deployment (no container restart needed, the values do not
change):

```sh
mkdir -p ~/.config/bottleneck-auth && chmod 700 ~/.config/bottleneck-auth
mv .env ~/.config/bottleneck-auth/prod.env && chmod 600 ~/.config/bottleneck-auth/prod.env
mv oidc-private.pem oidc-public.pem ~/.config/bottleneck-auth/ 2>/dev/null || true
echo 'export COMPOSE_ENV_FILES="$HOME/.config/bottleneck-auth/prod.env"' >> ~/.zshrc
# new shell, then:
docker compose config --quiet && docker compose ps
```

Development-only values (`TEST_BEARER`, a scratch `DATABASE_URL`) belong in a
separate file passed with `--env-file`, not in `prod.env`.

Copy `.env.example` and set at least:

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

The connector reads its token from the `TUNNEL_TOKEN` environment variable
(Compose maps `CLOUDFLARED_TOKEN` to it), so the token never appears in
`docker compose ps` or `docker top`. It also serves its metrics endpoint at
`http://cloudflared:2000` inside the Compose network: `/ready` returns 200
only while at least one connection to the Cloudflare edge is registered, and
`/metrics` is Prometheus text. Neither is published on a host port. The image
is distroless, so there is no in-container healthcheck; readiness is checked
from another container.

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

Set `ALERT_TELEGRAM_CHAT_ID` (a group the bot is a member of; falls back to
`BEARER_ADMIN_TELEGRAM_ID`) to receive Telegram messages for:

- a webhook endpoint auto-disabled after consecutive failures, or an enqueue
  that failed (app);
- Redis unreachable, with rate limiting on the in-process fallback (app);
- a worker loop that errored: webhook batch, hygiene, activation expiry,
  restriction, deletion, digest (worker);
- a migration that failed at boot, which would otherwise be a silent crash
  loop (app image, before the server starts).

Every alert is deduplicated per key: five minutes for one-off events, thirty
minutes for conditions that repeat every tick. Alerts no-op outside
production or without a chat id, and never block the request or loop that
raised them.

The worker also sends a daily digest at `DIGEST_HOUR_UTC` (default 8): user
and webhook counts, security events by type for the last 24 hours, worker
uptime, and how many alerts went out that day. The digest arriving is the
proof that the worker, the database, and the alert channel are alive; its
absence is itself the alert. `docker compose exec -T worker node worker.js
--digest` sends one immediately, bypassing the daily window, which is the
runbook's "is the channel alive" check.

These alerts are sent from the host. When the host, the tunnel, or the
worker is down nothing can send them, so they do not replace an external
uptime monitor.

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

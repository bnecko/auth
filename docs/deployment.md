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
so `docker compose up -d --build app worker` is safe at any time. To rebuild
only the worker or the bot, add `--no-deps`: without it Compose also builds
and recreates the app they depend on, which costs a short window of 502s
at the edge.

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
worker is down nothing can send them, so they do not replace the external
monitor described next.

## Monitoring

The external monitor is a Cloudflare Worker in `monitor/`, running on the
Workers free plan: a cron trigger every minute probes the public endpoints,
judges the heartbeats it has received, and posts to the alert chat only when
a check changes state (`DOWN: ...`, `RECOVERED: ... after 7m`), plus one
"External monitor: n/4 checks up" line per day at `SUMMARY_HOUR_UTC`. It runs
on Cloudflare's network, so it keeps working when this host does not. Setup:

```sh
cd monitor && npm ci
npx wrangler login                       # once, opens a browser
npx wrangler d1 create auth-monitor      # once; wrangler.jsonc pins the printed database_id
npx wrangler deploy
npx wrangler d1 migrations apply auth-monitor --remote
npx wrangler secret put PING_TOKEN       # openssl rand -hex 32
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ALERT_TELEGRAM_CHAT_ID
```

The cron starts with the first deploy, so `npx wrangler tail` shows a few
error lines until the migration and the secrets are in place; nothing is
sent to the chat before the secrets exist. Later code changes are just
`npx wrangler deploy`. In a non-interactive shell (`CI=true`) `d1 create`
prints the id but does not write it into the config; paste it into
`wrangler.jsonc` by hand.

`wrangler deploy` prints the Worker URL; the heartbeat URLs for the env file
are `https://<worker-url>/ping/worker?token=<PING_TOKEN>` and
`.../ping/bot?token=<PING_TOKEN>`, and `MONITOR_STATUS_URL` is
`https://<worker-url>/status?token=<PING_TOKEN>`. The token is compared in
constant time and never logged. `TELEGRAM_BOT_TOKEN` now has a second
consumer (see the runbook's rotation matrix). Any other ping-URL monitoring
service works in its place; the checks below are what it must implement.

`/status` in the alert chat asks the bot for a layer-by-layer breakdown
(Cloudflare's status page, cloudflared's edge connections, the app's
readiness, the heartbeats as the Worker sees them, the public probe) with a
verdict and the layer to blame, so an outage can be placed at the host, the
tunnel, the edge, or the caller's own side. It needs `ALERT_TELEGRAM_CHAT_ID`,
`MONITOR_STATUS_URL` and `CLOUDFLARED_READY_URL` on the bot service. No reply
means the bot or the host is down; the Worker's own DOWN message says which.

Two kinds of check:

HTTP probes, from outside, through the tunnel:

- `GET https://auth.bneck.com/api/health/ready`, expect 200 and a body
  containing `"ok":true`, every 1 to 2 minutes. This is the end-to-end check:
  tunnel, app, Postgres and Redis.
- `GET https://auth.bneck.com/.well-known/openid-configuration`, expect 200
  and `"issuer":"https://auth.bneck.com"`, every 5 minutes. Catches a
  misconfigured base URL that the readiness probe would not.
- Optional: `GET https://auth.bneck.com/oauth/jwks`, expect the active
  `kid`, every 15 minutes, to catch a signing-key regression.

Cloudflare's bot protection may block a vendor's probes; if the checks fail
with 403 while the site works, add a WAF skip rule for `/api/health/*` and
the discovery path scoped to the vendor's user agent or IP ranges.

Heartbeats (dead-man's switches), pinged from inside:

- `HEARTBEAT_URL_WORKER`: the worker pings once a minute, but only while
  every background loop has completed without error inside its tolerance
  and Redis answers. Configure the check for a 1 minute period and a 3
  minute grace. When it withholds the ping it also logs
  `heartbeat_withheld` and sends a `worker_unhealthy` alert, so the two
  signals corroborate each other.
- `HEARTBEAT_URL_BOT`: the bot pings once a minute while its Telegram
  long-poll keeps succeeding. Same period and grace. The pinned status
  message in the analytics chat also reads DEGRADED with the age of the last
  good poll when it is stale.
- `CLOUDFLARED_READY_URL` (`http://cloudflared:2000/ready`): not a heartbeat,
  but the worker checks it every minute and alerts `cloudflared_not_ready`
  while the tunnel has no edge connection. The HTTP probes above are the
  tunnel's dead-man's switch; this only gets the news out faster while the
  host can still speak.

The daily digest (above) is the slowest of the switches: its absence means
the worker, the database, or the alert channel has been dead for up to a day.

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

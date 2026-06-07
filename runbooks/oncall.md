# On-call runbook

For the responder paged about `auth.bneck.com` at an inconvenient hour. The
stack is Docker Compose on a single host behind a Cloudflare Tunnel:
`app` (Next.js), `worker` (webhook delivery + sweeps), `db` (Postgres),
`redis`, `cloudflared`. All commands run from the repo root on the host.

## First moves

```sh
docker compose ps                       # what is up / restarting
curl -s localhost:3000/api/health/ready # readiness (needs to run on the host net)
docker compose logs --tail=200 app
docker compose logs --tail=200 worker
```

Logs are structured JSON lines (`{"ts","level","msg",...}`). Filter with:

```sh
docker compose logs app | grep '"level":"error"'
```

## Symptoms

### Site down / 5xx
1. `docker compose ps` — is `app` healthy? If unhealthy, `/api/health/ready` is
   failing, which means Postgres or Redis is unreachable.
2. Check `db` and `redis`: `docker compose logs --tail=100 db redis`.
3. Restart the failed dependency, then the app:
   `docker compose restart db && docker compose up -d app`.
4. If the app crash-loops at boot with "missing required environment
   variables", a secret is unset — see `.env` against `.env.example`.

### Webhook backlog or an auto-disabled endpoint
- `webhook_endpoint_auto_disabled` in the worker logs (and a Telegram alert if
  `ALERT_TELEGRAM_CHAT_ID` is set) means an endpoint failed
  `AUTO_DISABLE_THRESHOLD` deliveries in a row and was disabled.
- Inspect: `docker compose exec -T db psql -U auth -d auth -c "select id,url,status,consecutive_failures from webhook_endpoints where status='disabled';"`
- Re-enable after the receiver is fixed:
  `update webhook_endpoints set status='active', consecutive_failures=0 where id=<id>;`
- Pending deliveries retry automatically via `next_attempt_at`; no manual
  requeue is needed.

### Rate-limiting acting up
- Per-IP limiting depends on `TRUSTED_PROXY=cf` (the app trusts
  `cf-connecting-ip` only when set). If everyone shares one bucket, confirm it
  is set in the app environment.
- Counters live in Redis; flushing them is safe but global. Prefer waiting out
  the window.

### Suspected leaked secret
1. Rotate the secret in `.env` (e.g. `OAUTH_CSRF_SECRET`, `OIDC_PRIVATE_KEY_PEM`,
   `TELEGRAM_BOT_TOKEN`, `POSTGRES_PASSWORD`).
2. `docker compose up -d --build app worker` to pick it up.
3. Rotating `OAUTH_CSRF_SECRET` invalidates in-flight consent/activation CSRF
   tokens (users retry). Rotating the OIDC key invalidates issued tokens.

## Deploys and restarts

```sh
docker compose up -d --build app worker   # rebuild + rolling restart, migrations run on app start
docker compose restart worker             # graceful (SIGTERM) restart, drains in-flight deliveries
```

## Audit trail

Security-relevant events are in the `security_events` table (logins, lockouts,
webhook auto-disable, admin actions, password changes). Example:

```sh
docker compose exec -T db psql -U auth -d auth -c "select created_at,event_type,result,ip from security_events order by created_at desc limit 50;"
```

## Backup / restore

See `docs/deployment.md` (Backup and restore).

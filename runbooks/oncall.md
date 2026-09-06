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
   variables", or the bot with "<NAME> is required", a secret is unset — see
   the env file (`docs/deployment.md`, Environment file) against
   `.env.example`. `docker compose` refusing to start with "set <NAME>" is the
   same cause, and so is a shell without `COMPOSE_ENV_FILES` exported.

### Webhook backlog or an auto-disabled endpoint
- `webhook_endpoint_auto_disabled` in the worker logs (and a Telegram alert if
  `ALERT_TELEGRAM_CHAT_ID` is set) means an endpoint failed
  `AUTO_DISABLE_THRESHOLD` deliveries in a row and was disabled.
- Inspect: `docker compose exec -T db psql -U auth -d auth -c "select id,url,status,consecutive_failures from webhook_endpoints where status='disabled';"`
- Re-enable after the receiver is fixed:
  `update webhook_endpoints set status='active', consecutive_failures=0 where id=<id>;`
- Disabling an endpoint (auto or by its owner) cancels its queued deliveries,
  so re-enabling does not replay them. Replay what matters from
  `/admin/webhooks?status=cancelled` with Retry, which is offered only while
  the endpoint is active. Anything left cancelled is purged after 30 days.
- Deliveries for an active endpoint retry automatically via `next_attempt_at`;
  no manual requeue is needed.

### Rate-limiting acting up
- Per-IP limiting depends on `TRUSTED_PROXY=cf` (the app trusts
  `cf-connecting-ip` only when set). If everyone shares one bucket, confirm it
  is set in the app environment.
- Counters live in Redis; flushing them is safe but global. Prefer waiting out
  the window.

## Secrets

### Where they live
`~/.config/bottleneck-auth/prod.env` (0600, directory 0700), loaded through
`COMPOSE_ENV_FILES`; see `docs/deployment.md`. Values still reach `docker
inspect` of each container, so a host-level compromise is a compromise of
every secret below regardless of the file's mode.

### Rotation matrix
Restart sets use `--no-deps` on purpose: a bare `docker compose up -d` after
changing `POSTGRES_PASSWORD` also recreates `db` (its own environment
changed), which is a short outage you should schedule, not trip over.

| Secret | Consumers | Restart set | Blast radius of the gap | Overlap |
| --- | --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | `db` (initdb only), `app`, `worker` via `DATABASE_URL` | `alter role`, then `up -d --no-deps app worker` | DB errors until both restart | none; seconds |
| `OIDC_PRIVATE_KEY_PEM`, `OIDC_KEY_ID`, `OIDC_SIGNING_KEYS_JSON` | `app` | `up -d --no-deps app` | tokens signed by a dropped key stop verifying | yes, via `retired` status |
| `OAUTH_CSRF_SECRET` | `app` | `up -d --no-deps app` | in-flight consent/activation forms fail once | none |
| `TELEGRAM_BOT_TOKEN` | `app`, `worker`, `bot` | `up -d --no-deps app worker bot` | 2FA prompts, notifications, bot sign-in fail; queued jobs retry | edit env, then BotFather revoke |
| `TELEGRAM_BOT_WEBHOOK_SECRET` | `app`, `bot` | `up -d --no-deps app bot` | a tap in the gap fails; retry works | none |
| `INTERNAL_ANALYTICS_SECRET` | `app`, the external analytics caller | `up -d --no-deps app` and the caller | analytics posts 401 until the caller updates | none |
| `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `app` (read at runtime) | `up -d --no-deps app` | forms fail closed until restart | create the new widget first |
| `CLOUDFLARED_TOKEN` | `cloudflared` | `up -d --no-deps cloudflared` | seconds of tunnel outage | second tunnel + DNS cutover; rarely worth it |
| `RESEND_API_KEY` | `app` | `up -d --no-deps app` | verification emails fail | create new, deploy, delete old |
| `OAUTH_DYNAMIC_REGISTRATION_TOKEN` | `app`, DCR clients | `up -d --no-deps app` | DCR calls 401 until clients update | none |

`BEARER_ADMIN_TELEGRAM_ID` and `ALERT_TELEGRAM_CHAT_ID` are identifiers, not
secrets, but changing them takes the same restart sets as `TELEGRAM_BOT_TOKEN`.

### Procedures

#### POSTGRES_PASSWORD
1. Put the new value in the env file (`POSTGRES_PASSWORD` and the password
   inside `DATABASE_URL` if it is spelled out there).
2. Change it inside Postgres over the unix socket, which does not need the old
   password:
   `docker compose exec -T db psql -U auth -d auth -c "alter role auth password '<new>'"`
3. Immediately: `docker compose up -d --no-deps app worker`. Between steps 2
   and 3 every new connection fails, so keep them back to back.
4. The `db` container's environment is now stale; the next full
   `docker compose up -d` recreates it (~5 s, data stays in the volume). Do
   that deliberately at a quiet moment rather than as a surprise.

#### OIDC signing key (no downtime)
Verification accepts every key that is not `revoked`, and the JWKS publishes
the same set, so a rotation is: add the new key as active, keep the old one as
retired until every token it signed has expired, then revoke it.
1. Set `OIDC_SIGNING_KEYS_JSON` to
   `[{"kid":"2026-09","privateKeyPem":"<new pem>","status":"active"},{"kid":"<old kid>","privateKeyPem":"<old pem>","status":"retired"}]`.
   Once this variable is set, `OIDC_PRIVATE_KEY_PEM` is ignored.
2. `docker compose up -d --no-deps app`, then confirm both kids appear in
   `https://auth.bneck.com/oauth/jwks`.
3. Wait at least 24 h (access tokens live 15 min, but relying parties cache
   the JWKS), flip the old entry to `"revoked"`, redeploy, and drop it from
   the list on a later change.

#### TELEGRAM_BOT_TOKEN
1. Put the new token in the env file first.
2. `/revoke` the old one in BotFather; the old token dies instantly.
3. Within a minute: `docker compose up -d --no-deps app worker bot`. 2FA
   prompts sent in the gap fail (the user retries); queued notifications retry
   under bullmq. The bot re-pins a fresh status message on start.

#### TELEGRAM_BOT_WEBHOOK_SECRET
Edit the env file and `docker compose up -d --no-deps app bot` in one go; the
two sides must agree.

#### CLOUDFLARED_TOKEN
Refresh the token in Zero Trust, edit the env file, `docker compose up -d
--no-deps cloudflared`. Expect a few seconds of tunnel downtime and one false
alarm from any external probe.

### Suspected leak: triage order
1. OIDC signing key (token forgery), then `TELEGRAM_BOT_TOKEN` and
   `TELEGRAM_BOT_WEBHOOK_SECRET` (2FA approval forgery). Rotate these first.
2. `OAUTH_CSRF_SECRET`.
3. `POSTGRES_PASSWORD`: the database is not reachable from outside the compose
   network, so real exposure needs host access, which is a bigger incident.
4. Everything else in the matrix, then review `security_events` for activity
   during the exposure window (Audit trail below).

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

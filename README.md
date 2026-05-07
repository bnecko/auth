# Bottleneck Auth

Identity and activation service for Bottleneck apps.

## Local

```sh
cp .env.example .env
docker compose up --build
```

Set `POSTGRES_PASSWORD` and `CLOUDFLARED_TOKEN` in `.env` before starting the stack. The app is not published on a host port by default; Cloudflare Tunnel connects to `http://app:3000` inside the Compose network.

In the Cloudflare Tunnel public hostname settings, use:

```text
Service: http://app:3000
```

The schema is loaded from `db/schema.sql` on first Postgres startup.

## Resource profile

The default Compose file is tuned for a small always-on host:

- app: 384 MB, Node old-space capped at 256 MB
- Postgres: 512 MB, 30 connections, small working memory
- cloudflared: 128 MB

Raise `DATABASE_POOL_MAX` and `APP_NODE_OPTIONS` only if traffic requires it.

## Main flows

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /activate?token=...`
- `POST /api/activation-requests`
- `GET /api/activation-requests/:id`
- `POST /api/telegram/bot/verify`

External apps create activation requests with a bearer API key stored as a SHA-256 hash in `external_apps.api_key_hash`.

External app integration details are in `docs/external-apps.md`.

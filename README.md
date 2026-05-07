# Bottleneck Auth

Identity and activation service for Bottleneck apps.

## Local

```sh
cp .env.example .env
docker compose up --build
```

The schema is loaded from `db/schema.sql` on first Postgres startup.

## Main flows

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /activate?token=...`
- `POST /api/activation-requests`
- `GET /api/activation-requests/:id`
- `POST /api/telegram/bot/verify`

External apps create activation requests with a bearer API key stored as a SHA-256 hash in `external_apps.api_key_hash`.

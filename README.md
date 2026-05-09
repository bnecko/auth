# Bottleneck Auth

Identity and activation service for Bottleneck apps.

## Local

```sh
cp .env.example .env
docker compose up --build
```

Set `POSTGRES_PASSWORD` and `CLOUDFLARED_TOKEN` in `.env` before starting the stack. The app is not published on a host port by default; Cloudflare Tunnel connects to `http://app:3000` inside the Compose network.

If `TURNSTILE_SECRET_KEY` is set, also set `TURNSTILE_SITE_KEY`; registration and login forms fetch that site key at runtime.

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
- `GET /oauth/authorize`
- `POST /api/oauth/token`
- `GET /api/oauth/userinfo`
- `GET /activate?token=...`
- `POST /api/activation-requests`
- `GET /api/activation-requests/:id`
- `POST /api/telegram/bot/verify`

External apps create activation requests with a bearer API key stored as a SHA-256 hash in `external_apps.api_key_hash`.

External apps can also use OAuth/OIDC Authorization Code + PKCE. The OAuth
`client_id` is `external_apps.public_id`; confidential clients may use the
same issued app API key as their OAuth `client_secret`.

## Documentation

Detailed documentation is available in the `docs/` directory:
- `docs/backend-stack.md`: Core architecture, domain boundaries, and database schema.
- `docs/external-apps.md`: Guide for integrating external apps with the activation API.
- `docs/oauth.md`: OAuth Authorization Code + PKCE integration guide.

## Testing

You can test the external app activation API flow locally or against production using the provided `test.py` script.

Make sure you have your external app bearer token set in your `.env` file:
```env
TEST_BEARER="your-app-api-key"
```

Then run the script:
```sh
python test.py
```

The script will generate an activation request, print a URL for you to open in your browser to approve, and automatically poll for the resulting profile data.

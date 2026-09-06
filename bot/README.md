# auth-bot

Telegram bot that turns `/start <token>` messages into verification calls against the auth service.

## How it fits

1. `/register` on auth creates a registration request and returns a `t.me/<bot>?start=<token>` URL.
2. User opens the link, Telegram sends `/start <token>` to this bot.
3. This bot POSTs to `${AUTH_INTERNAL_URL}/api/telegram/bot/verify` with the token and the user's Telegram identity.
4. The auth service marks the registration as verified, the `/verify` page polls and completes registration.

Long-polls Telegram (`getUpdates`), so it does not need a public URL. Only the auth service needs to be reachable from the bot.

## Required env

- `TELEGRAM_BOT_TOKEN` - from BotFather
- `TELEGRAM_BOT_WEBHOOK_SECRET` - must match the auth service's value
- `AUTH_INTERNAL_URL` - default `http://localhost:3000`, set to `http://app:3000` in compose
- `BEARER_ADMIN_TELEGRAM_ID` - Telegram user id allowed to approve or reject bearer
  requests; must match the auth service's value, or every decision is refused

The bot username (`TELEGRAM_BOT_USERNAME`) is only needed by the auth service to build the start link.

## Optional env

- `HEARTBEAT_URL` - pinged once a minute while the long-poll succeeds (see `docs/deployment.md`, Monitoring)
- `ALERT_TELEGRAM_CHAT_ID` - the chat in which `/status` is answered; the admin's private chat always works
- `MONITOR_STATUS_URL` - the external monitor's `/status?token=...` URL, read by `/status`
- `CLOUDFLARED_READY_URL` - cloudflared's `/ready` endpoint, read by `/status`
- `TELEGRAM_ANALYTICS_CHAT_ID` / `TELEGRAM_ANALYTICS_THREAD_ID` - where the pinned status message lives

## /status

`/status` in the alert chat (or from the admin in a private chat) replies with a
layer-by-layer breakdown: Cloudflare's own status page, the tunnel's edge
connections, the app's readiness (Postgres, Redis), the worker and bot
heartbeats as the external monitor sees them, and the public probe. The first
line says UP, DEGRADED or DOWN and the second names the layer to blame. No reply
means the bot itself, or the whole host, is down; the external monitor's last
DOWN message in the chat says which. `node index.js --status` prints the same
report from a shell (`docker compose exec bot node index.js --status`).

## Run

```
TELEGRAM_BOT_TOKEN=... TELEGRAM_BOT_WEBHOOK_SECRET=... BEARER_ADMIN_TELEGRAM_ID=... npm start
```

Only one instance can long-poll a bot at a time.

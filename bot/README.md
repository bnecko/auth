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

The bot username (`TELEGRAM_BOT_USERNAME`) is only needed by the auth service to build the start link.

## Run

```
TELEGRAM_BOT_TOKEN=... TELEGRAM_BOT_WEBHOOK_SECRET=... npm start
```

Only one instance can long-poll a bot at a time.

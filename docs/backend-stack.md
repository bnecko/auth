# Bottleneck Auth Backend

## Purpose

`auth.bottleneck.cc` is an identity and activation service for Bottleneck-owned apps and external integrations.

It handles:

- user registration and login
- Telegram verification
- activation token approval
- subscription and entitlement checks
- external app authorization
- account, session, and abuse controls
- a small user dashboard when no activation token is present

The activation token passed in the URL is not a login credential. It identifies a pending activation request. The server validates it, asks the user to authenticate, then approves or rejects the request.

## Suggested Stack

- Runtime: Node.js, using the existing style from `readme-bottleneck`
- Server: plain Node HTTP for first version, or Fastify if routing starts growing
- Database: Postgres
- Cache/rate limits: Redis or Upstash Redis
- Edge protection: Cloudflare
- Bot protection: Cloudflare Turnstile
- Auth verification: Telegram Login Widget or a dedicated Telegram bot
- Session storage: signed, httpOnly, secure cookies plus hashed server-side sessions
- Deployment: Docker Compose behind Cloudflare Tunnel or a normal reverse proxy

For a prototype, SQLite can work. For anything public, start with Postgres.

## Domains

- `auth.bottleneck.cc`: auth service
- `bottleneck.cc`: public profile/site
- `static.bottleneck.cc`: static fallback/assets if still useful

## Core Routes

Public:

- `GET /`
  - If logged out: redirect to `/login`
  - If logged in: show dashboard

- `GET /activate?token=...`
  - Validate activation request
  - If logged out: save pending activation in session and redirect to login/register
  - If logged in: show activation approval screen

- `POST /activate/:id/approve`
  - Requires logged-in user
  - Checks subscription/entitlements
  - Marks activation as approved
  - Returns redirect/callback result

- `POST /activate/:id/deny`
  - Marks activation as denied

- `GET /login`
  - Login form

- `POST /login`
  - Email or username plus password
  - Turnstile should be required after suspicious attempts

- `GET /register`
  - Registration form

- `POST /register`
  - Creates pending account after validation
  - Requires Telegram verification before activation

- `GET /logout`
  - Revokes current session

Telegram:

- `GET /telegram/callback`
  - Used by Telegram Login Widget
  - Verifies Telegram signature
  - Links Telegram identity to account

- `POST /telegram/bot/verify`
  - Optional route for bot-based verification
  - Used if the flow depends on a dedicated Telegram bot

External app API:

- `POST /api/activation-requests`
  - Creates a short-lived activation request
  - Returns activation URL
  - Requires app API key

- `GET /api/activation-requests/:id`
  - Lets an app poll activation status
  - Requires app API key

- `POST /api/activation-requests/:id/cancel`
  - Cancels a pending activation

Admin:

- `GET /admin`
  - Admin overview

- `GET /admin/users`
  - Search users

- `POST /admin/users/:id/ban`
  - Ban account and revoke sessions

- `POST /admin/users/:id/unban`
  - Restore account access

- `GET /admin/security`
  - Abuse and security events

## Database Structure

### users

- `id`
- `public_id`
- `first_name`
- `username`
- `bio`
- `email`
- `email_verified_at`
- `dob`
- `password_hash`
- `telegram_id`
- `telegram_username`
- `telegram_verified_at`
- `status`
- `created_at`
- `updated_at`

`status` values:

- `pending`
- `active`
- `limited`
- `banned`

Notes:

- `bio` is public.
- `dob` is optional and should only be shared with external apps when the user approves that scope.
- `telegram_id` must be unique when present.
- `username` should be unique and case-insensitive.

### sessions

- `id`
- `user_id`
- `session_hash`
- `ip`
- `user_agent`
- `created_at`
- `last_seen_at`
- `expires_at`
- `revoked_at`

Store only a hash of the session secret.

### external_apps

- `id`
- `name`
- `slug`
- `owner_user_id`
- `api_key_hash`
- `callback_url`
- `allowed_redirect_urls`
- `status`
- `created_at`
- `updated_at`

### activation_requests

- `id`
- `external_app_id`
- `token_hash`
- `status`
- `requested_subject`
- `approved_user_id`
- `callback_url`
- `return_url`
- `ip`
- `user_agent`
- `created_at`
- `expires_at`
- `approved_at`
- `denied_at`

`status` values:

- `pending`
- `approved`
- `denied`
- `expired`
- `cancelled`

Activation tokens should be random, opaque, single-use, and short-lived.

### subscriptions

- `id`
- `user_id`
- `product`
- `status`
- `starts_at`
- `expires_at`
- `revoked_at`
- `created_at`
- `updated_at`

`status` values:

- `active`
- `expired`
- `revoked`
- `trial`

### app_authorizations

- `id`
- `user_id`
- `external_app_id`
- `scopes`
- `created_at`
- `revoked_at`

Example scopes:

- `profile:read`
- `email:read`
- `dob:read`
- `subscription:read`

### security_events

- `id`
- `user_id`
- `event_type`
- `result`
- `ip`
- `user_agent`
- `country`
- `metadata`
- `created_at`

Examples:

- `register_attempt`
- `login_success`
- `login_failure`
- `telegram_verify_success`
- `activation_approved`
- `activation_denied`
- `rate_limited`
- `account_banned`

### bans

- `id`
- `user_id`
- `kind`
- `value_hash`
- `reason`
- `created_by_user_id`
- `created_at`
- `expires_at`
- `revoked_at`

`kind` examples:

- `account`
- `email`
- `telegram_id`
- `ip`
- `subnet`
- `asn`

Do not rely on hardware bans for web users. They are unreliable and easy to bypass. Use account, Telegram identity, payment identity, IP/subnet/ASN controls, and session revocation.

## Registration Flow

1. User opens `/register`.
2. User enters:
   - first name
   - username
   - optional bio
   - email
   - optional date of birth
   - password
3. Server validates username, email, and password.
4. Cloudflare Turnstile is checked when enabled.
5. User clicks `Verify with Telegram and complete`.
6. The auth service creates a one-time Telegram `/start` token.
7. The bot receives `/start <token>` and sends the token plus Telegram identity to the auth service.
8. Telegram identity is verified.
9. Account is created as `active`, or `pending` if manual review is required.
10. Session is created.
11. If an activation request was pending, user is returned to activation approval.
12. Otherwise user is sent to dashboard.

## Login Flow

1. User enters username/email and password.
2. Server checks password hash.
3. Suspicious attempts require Turnstile.
4. If the account is banned, deny login and do not create a session.
5. If valid, create session and redirect to pending activation or dashboard.

## Activation Flow

1. External app creates an activation request through the API.
2. External app sends user to `/activate?token=...`.
3. Auth server hashes the token and loads the pending request.
4. If invalid, expired, or cancelled, show a failure page.
5. If logged out, user logs in or registers.
6. User sees the app name, requested scopes, subscription requirement, and request metadata.
7. User approves or denies.
8. Server checks account status and subscriptions.
9. Server marks request as approved or denied.
10. External app receives the result by callback, polling, or return redirect.

## Bot And Abuse Controls

Use layered controls:

- Cloudflare WAF and rate limits
- Cloudflare Turnstile on registration and suspicious login attempts
- per-IP rate limits
- per-username/email rate limits
- per-Telegram-ID limits
- per-activation-token limits
- short-lived activation tokens
- account status flags
- manual review for suspicious accounts
- session revocation on ban
- temporary IP/subnet/ASN bans for active attacks

Turnstile should be optional in local development and mandatory in production.

## Privacy Rules

- Store only fields that have a product reason.
- Hash session tokens, activation tokens, API keys, and ban values.
- Do not expose `dob` to external apps without an explicit scope.
- Do not expose email unless the user approves `email:read`.
- Keep security events for a limited retention period, for example 90 days.
- Keep admin-only audit logs out of public dashboards.

## First Version Scope

Build first:

- registration
- login
- Telegram verification
- dashboard
- activation request validation
- activation approval
- Postgres schema
- Cloudflare Turnstile integration
- admin ban/revoke controls

Defer:

- payments
- OAuth provider support beyond Telegram
- public developer portal
- complex analytics
- hardware/device bans
- organization/team accounts

-- 022_settings_prefs.sql
-- Notification preferences + privacy controls for the Settings hub. Each flag
-- gates a real send or render (no dead switches): the notify_* flags gate
-- Telegram messages in notifyUser(); the public/discoverable/show_telegram
-- flags gate the public profile at /u/[id] and the /user/[username] alias.
-- Additive + idempotent; mirror in db/schema.sql.

alter table users add column if not exists notify_security_receipts boolean not null default true;
alter table users add column if not exists notify_signin_alerts boolean not null default true;
alter table users add column if not exists profile_public boolean not null default true;
alter table users add column if not exists discoverable_by_username boolean not null default true;
alter table users add column if not exists public_show_telegram boolean not null default true;

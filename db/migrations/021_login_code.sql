-- 021_login_code.sql
-- 2FA redesign: the login prompt is pushed to Telegram with Log in/Not me
-- buttons; tapping Log in issues a 6-digit code the user types on the web. Adds
-- the code hash + an 'approved' (tapped, code issued) status. Additive +
-- idempotent; mirror in db/schema.sql.

alter table telegram_login_challenges add column if not exists code_hash text;

do $$
begin
  alter table telegram_login_challenges
    drop constraint if exists telegram_login_challenges_status_check;
  alter table telegram_login_challenges
    add constraint telegram_login_challenges_status_check
    check (status in ('pending', 'approved', 'verified', 'expired', 'cancelled'));
end $$;

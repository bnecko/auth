-- 019_bans_bearer.sql
-- Make the bans table enforceable for Telegram-ID bans, and secure the bearer
-- lifecycle (creator Telegram id + user-initiated revocation). Additive +
-- idempotent; mirror in db/schema.sql.

alter table bearer_requests add column if not exists created_by_telegram_id text;
alter table bearer_requests add column if not exists revoked_at timestamptz;

-- Extend the status check to allow 'revoked'. Guarded drop/recreate so it is a
-- no-op when the constraint already matches (schema.sql carries the new form).
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'bearer_requests_status_check'
  ) then
    alter table bearer_requests drop constraint bearer_requests_status_check;
  end if;
  alter table bearer_requests add constraint bearer_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cleared', 'revoked'));
end $$;

-- At most one active ban per (kind, value_hash) so re-banning the same Telegram
-- id is idempotent (ON CONFLICT DO NOTHING relies on this).
create unique index if not exists bans_active_kind_value_idx
  on bans(kind, value_hash)
  where revoked_at is null and value_hash is not null;

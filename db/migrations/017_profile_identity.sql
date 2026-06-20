-- 017_profile_identity.sql
-- Profile self-service: avatar presets, and durable + audited username/email
-- change requests that are confirmed over Telegram (mirrors registration_requests).
-- Additive + idempotent so both migration-smoke paths pass; mirror in db/schema.sql.

alter table users add column if not exists avatar_preset smallint;

create table if not exists profile_change_requests (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint not null references users(id) on delete cascade,
  field text not null check (field in ('username', 'email')),
  new_value text not null,
  new_value_normalized text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'expired', 'cancelled')),
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);

create index if not exists profile_change_requests_user_idx
  on profile_change_requests(user_id);
create index if not exists profile_change_requests_status_idx
  on profile_change_requests(status);
create index if not exists profile_change_requests_expires_idx
  on profile_change_requests(expires_at);

-- 020_restrictions.sql
-- Suspicious-activity review queue + the restriction system: a softer lockdown
-- than a ban that leaves one surface open (a private security thread). Additive
-- + idempotent; mirror in db/schema.sql.

-- Denormalized flag, read on the hot session path so no extra join is needed.
alter table users add column if not exists restricted boolean not null default false;
alter table users add column if not exists restricted_at timestamptz;
create index if not exists users_restricted_idx on users(id) where restricted;

-- Security sub-roles layered on the existing supporter roster.
alter table support_team add column if not exists role text not null default 'supporter';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_team_role_check'
  ) then
    alter table support_team add constraint support_team_role_check
      check (role in ('supporter', 'security', 'security_high'));
  end if;
end $$;

-- Allow a 'security' thread kind (the restricted user's conversation).
do $$
begin
  alter table support_threads drop constraint if exists support_threads_kind_check;
  alter table support_threads add constraint support_threads_kind_check
    check (kind in ('ticket', 'issue', 'security'));
end $$;

create table if not exists user_restrictions (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint not null references users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'appealed', 'closed', 'lifted')),
  trigger_type text not null,
  trigger_code text not null unique,
  reason text,
  security_thread_id bigint references support_threads(id) on delete set null,
  suspicion_event_id bigint,
  restricted_by_user_id bigint references users(id) on delete set null,
  last_user_activity_at timestamptz,
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);

create unique index if not exists user_restrictions_active_user_idx
  on user_restrictions(user_id) where status = 'active';
create index if not exists user_restrictions_status_activity_idx
  on user_restrictions(status, last_user_activity_at);

create table if not exists suspicion_events (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint references users(id) on delete cascade,
  trigger_type text not null,
  score integer not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'actioned', 'dismissed')),
  reviewed_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists suspicion_events_status_created_idx
  on suspicion_events(status, created_at);
create index if not exists suspicion_events_user_idx on suspicion_events(user_id);

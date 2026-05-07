-- 002 — bearer_requests
--
-- Adds the table that backs the user-initiated API bearer flow:
-- a user submits app name + reason, the configured admin Telegram
-- account approves or rejects via inline buttons, and on approval the
-- generated key is stashed here so the user can reveal it on their
-- dashboard. After the user dismisses it ("I saved it") plaintext_key
-- is cleared and only the sha256 hash in external_apps remains.
--
-- Apply against existing deployments where db/schema.sql was loaded
-- before this table existed:
--   psql "$DATABASE_URL" -f db/migrations/002_bearer_requests.sql

create table if not exists bearer_requests (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint not null references users(id) on delete cascade,
  app_name text not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cleared')),
  external_app_id bigint references external_apps(id) on delete set null,
  plaintext_key text,
  decided_by_telegram_id text,
  decided_at timestamptz,
  revealed_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bearer_requests_user_id_idx on bearer_requests(user_id);
create index if not exists bearer_requests_status_idx on bearer_requests(status);

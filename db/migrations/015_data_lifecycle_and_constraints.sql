-- 015_data_lifecycle_and_constraints.sql
-- Phase 3: data lifecycle + schema hygiene.
--
-- Every statement is additive and idempotent so it survives both paths the
-- migration smoke test exercises: (1) fresh DB -> run all migrations, and
-- (2) apply db/schema.sql (which mirrors these changes) -> run all migrations
-- on top. Path (2) means each statement here must be a no-op when the object
-- already exists, hence `add column if not exists`, `create index if not
-- exists`, and the `do $$ if not exists (pg_constraint) ... end $$` guard
-- (the same pattern as migration 005). Pre-constraint data fixes run first so
-- an ALTER never trips on existing rows.

-- (1) PAR single-use per RFC 9126: mark a pushed request consumed when an
-- authorization code is issued from it. Nullable, no default, so existing
-- in-flight rows read as "not yet consumed".
alter table oauth_pushed_requests
  add column if not exists consumed_at timestamptz;

create index if not exists oauth_pushed_requests_consumed_at_idx
  on oauth_pushed_requests(consumed_at);

-- Supports the worker's 90-day security_events retention sweep (delete by
-- created_at) and any time-range audit query on this append-heavy table.
create index if not exists security_events_created_at_idx
  on security_events(created_at);

-- (2) Subscriptions: one row per (user_id, product). Dedup any existing
-- duplicates first (keep the lowest id) so the unique constraint can be
-- added without error. There is no INSERT path for subscriptions in this
-- repo, so duplicates are only possible from external writes; the dedup is
-- a safety net (verified to touch zero rows on the current deployment).
delete from subscriptions s
 where exists (
   select 1 from subscriptions older
    where older.user_id = s.user_id
      and older.product = s.product
      and older.id < s.id
 );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_user_id_product_key'
  ) then
    alter table subscriptions
      add constraint subscriptions_user_id_product_key unique (user_id, product);
  end if;
end $$;

-- (3) users.first_name length cap, matching validation.ts (length > 80
-- rejected at registration). Truncate any pre-existing oversized values
-- before adding the CHECK so it is valid against current data.
update users
   set first_name = substring(first_name from 1 for 80)
 where length(first_name) > 80;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_first_name_length_check'
  ) then
    alter table users
      add constraint users_first_name_length_check check (length(first_name) <= 80);
  end if;
end $$;

-- (4) Document the existing oauth_client_secret_hash nullability policy.
-- Informational only; the column stays nullable and is correctly used
-- (public clients and private_key_jwt/none auth are null).
comment on column external_apps.oauth_client_secret_hash is
  'Hash of the current client secret. Confidential clients using client_secret_basic or client_secret_post have a value; public clients and private_key_jwt/none auth are null. Rotated secrets move to external_app_oauth_secrets with an expiry.';

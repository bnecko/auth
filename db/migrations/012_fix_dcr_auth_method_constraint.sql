-- Fix migration 011's silently-broken constraint update on
-- oauth_client_registration_requests.token_endpoint_auth_method.
--
-- Background: <table>_<column>_check = 67 chars for this table+column,
-- which exceeds Postgres's 63-char NAMEDATALEN limit. Different
-- truncation paths produce different stored names:
--
--   * Auto-generated (inline `check (...)` on column in migration 006)
--     uses ChooseConstraintName, which preserves the `_check` suffix
--     and truncates the middle:
--       oauth_client_registration_requ_token_endpoint_auth_method_check
--
--   * Explicit `add constraint <long name>` (migration 011) truncates
--     from the right, dropping `_check`:
--       oauth_client_registration_requests_token_endpoint_auth_method_c
--
-- Because the names differ, migration 011's `if exists … drop` never
-- matched the existing auto-generated constraint. The `add constraint`
-- then succeeded under a fresh truncated name, leaving TWO check
-- constraints in place. The original one still rejects 'private_key_jwt'.
--
-- Production was seeded from db/schema.sql (which carries the correct
-- 4-value check inline) so its single auto-generated constraint already
-- allows 'private_key_jwt' and the bug was invisible. CI runs the full
-- migration chain against an empty DB, which is where the duplicate
-- bites — DCR tests with token_endpoint_auth_method='private_key_jwt'
-- fail with a 23514 check_violation.
--
-- This migration drops every check constraint touching
-- token_endpoint_auth_method on the table (regardless of how its name
-- was truncated) and reinstates a single constraint with an explicit
-- short name that fits comfortably in 63 chars.

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'oauth_client_registration_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%token_endpoint_auth_method%'
  loop
    execute format(
      'alter table oauth_client_registration_requests drop constraint %I',
      c.conname
    );
  end loop;

  alter table oauth_client_registration_requests
    add constraint dcr_requests_token_auth_method_check
    check (token_endpoint_auth_method in (
      'client_secret_basic',
      'client_secret_post',
      'private_key_jwt',
      'none'
    ));
end $$;

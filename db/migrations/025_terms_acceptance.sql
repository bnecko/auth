-- 025_terms_acceptance.sql
-- Sign-up now requires accepting the Terms of Service, Privacy Policy, and
-- Rules. Record when each account accepted and which version it agreed to, so a
-- later change to those documents can be detected. Pre-existing accounts keep
-- NULL (they were never prompted). Additive + idempotent; mirror in db/schema.sql.

alter table users add column if not exists terms_accepted_at timestamptz;
alter table users add column if not exists terms_version text;

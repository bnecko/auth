-- 023_account_lifecycle.sql
-- Self-service account lifecycle for the Danger zone. deactivated_at marks a
-- reversible pause (cleared on the next successful sign-in); deletion_requested_at
-- marks a grace-period soft delete (also cancelled by signing in, otherwise the
-- worker purges the row after the grace window). Following the `restricted`
-- column precedent rather than overloading the status enum. Additive +
-- idempotent; mirror in db/schema.sql.

alter table users add column if not exists deactivated_at timestamptz;
alter table users add column if not exists deletion_requested_at timestamptz;

-- The worker scans this to purge accounts past their deletion grace window.
create index if not exists users_deletion_requested_idx
  on users(deletion_requested_at)
  where deletion_requested_at is not null;

-- 031_kyc_applications.sql
-- Identity verification state, one row per user.
--
-- No document, image, name or date of birth is stored here. Didit holds those;
-- this table holds a session reference and a decision. That is the whole point
-- of using a provider: a passport scan on this host would be worth more to an
-- attacker than the float it is meant to protect, and it is not a liability
-- worth taking on to save a few database columns.
--
-- Withdrawal is gated on status = 'approved'. Nothing else in the service
-- reads it, so an unapproved account is simply an account that cannot
-- withdraw, not a restricted one.
--
-- Additive + idempotent; mirror in db/schema.sql.

create table if not exists kyc_applications (
  user_id bigint primary key references users(id) on delete cascade,
  -- Didit's session id. Unique so a webhook can find the row by it, and so a
  -- replayed session cannot attach itself to a second account.
  session_id text unique,
  status text not null default 'not_started' check (status in (
    'not_started', 'in_progress', 'awaiting_user', 'in_review',
    'approved', 'declined', 'expired', 'abandoned'
  )),
  -- The provider's own wording, kept verbatim for support questions. Never
  -- shown to the user unmodified.
  provider_status text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kyc_applications_status_idx on kyc_applications(status);

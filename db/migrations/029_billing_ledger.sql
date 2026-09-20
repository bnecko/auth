-- 029_billing_ledger.sql
-- The btGRAM ledger behind the billing platform.
--
-- Double entry and append only. Every movement is a transfer with two legs
-- that sum to zero, so money cannot be created or destroyed by a bug in one
-- code path. Nothing here is ever updated or deleted: a mistake is corrected
-- by posting its reverse, which leaves both the mistake and the correction
-- visible.
--
-- Amounts are nanocoins as exact integers. A nanocoin total passes 2^53 at
-- nine coins, so anything that touched a float would lose the low digits of
-- real balances.
--
-- Additive + idempotent; mirror in db/schema.sql.

-- Three kinds of account:
--   user   one per account, holds a spendable btGRAM balance
--   pool   the public pool, a singleton, its balance shown to everyone
--   chain  everything outside this service, a singleton
--
-- The chain account is what keeps the books balanced without pretending money
-- appears from nowhere: a deposit debits chain and credits a user, a
-- withdrawal does the reverse. Its balance is negative by design, which is why
-- it is the one account with no enforced floor.
create table if not exists billing_accounts (
  id bigserial primary key,
  kind text not null check (kind in ('user', 'pool', 'chain')),
  -- Nulled rather than cascaded when an account is purged: the entries have to
  -- outlive the person, because they are the record of where the money went.
  -- The balance is moved to the pool before the user row goes.
  user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists billing_accounts_user_idx
  on billing_accounts(user_id) where user_id is not null;
create unique index if not exists billing_accounts_singleton_idx
  on billing_accounts(kind) where kind in ('pool', 'chain');

-- One row per movement. `reference` is the idempotency key, and it belongs
-- here rather than on the legs: both legs share it, so a unique index over the
-- legs could never hold. Replaying a chain ingestion or retrying a charge
-- conflicts here and posts nothing.
create table if not exists billing_transfers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'deposit', 'charge', 'refund', 'withdrawal', 'forfeit', 'pool_donation', 'adjustment'
  )),
  reference text,
  app_id bigint references external_apps(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists billing_transfers_reference_idx
  on billing_transfers(kind, reference) where reference is not null;

create table if not exists billing_entries (
  id bigserial primary key,
  transfer_id uuid not null references billing_transfers(id) on delete restrict,
  account_id bigint not null references billing_accounts(id) on delete restrict,
  amount_nano numeric(40, 0) not null check (amount_nano <> 0),
  created_at timestamptz not null default now()
);

create index if not exists billing_entries_account_idx on billing_entries(account_id, id);
create index if not exists billing_entries_transfer_idx on billing_entries(transfer_id);

-- A checked cache of the sum of an account's entries, not a second source of
-- truth. Postgres cannot express "the sum of these rows is never negative" as
-- a constraint, and an overdraft has to be impossible rather than unlikely, so
-- the balance is kept here under a check and written in the same transaction
-- as the legs. A reconciliation query asserts the two still agree.
--
-- Only accounts that must not go negative get a row; the chain account is
-- deliberately absent.
create table if not exists billing_balances (
  account_id bigint primary key references billing_accounts(id) on delete restrict,
  balance_nano numeric(40, 0) not null default 0 check (balance_nano >= 0),
  updated_at timestamptz not null default now()
);

insert into billing_accounts (kind) values ('pool') on conflict do nothing;
insert into billing_accounts (kind) values ('chain') on conflict do nothing;
insert into billing_balances (account_id)
  select id from billing_accounts where kind = 'pool'
  on conflict do nothing;

-- 032_billing_withdrawals.sql
-- Withdrawals: a user asks for btGRAM to be paid out as GRAM to their verified
-- wallet, the operator pays it by hand from their own wallet, and the chain
-- watcher confirms it. No key that can move funds lives on the server, so
-- nothing here sends anything. It only records what was asked for and what
-- the chain later showed.
--
-- Additive + idempotent; mirror in db/schema.sql.

-- A fourth kind of account: escrow, a singleton. A request moves the amount
-- from the user into escrow straight away, so it cannot be spent while the
-- payout is pending. Escrow has a balance row, so reconciliation still counts
-- it as owed, which it is until the GRAM has actually left on chain. From
-- there it goes to chain on confirmation, or back to the user on rejection.
alter table billing_accounts drop constraint if exists billing_accounts_kind_check;
alter table billing_accounts add constraint billing_accounts_kind_check
  check (kind in ('user', 'pool', 'chain', 'escrow'));

drop index if exists billing_accounts_singleton_idx;
create unique index billing_accounts_singleton_idx
  on billing_accounts(kind) where kind in ('pool', 'chain', 'escrow');

insert into billing_accounts (kind) values ('escrow') on conflict do nothing;
insert into billing_balances (account_id)
  select id from billing_accounts where kind = 'escrow'
  on conflict do nothing;

-- requested -> approved -> sent -> confirmed, or out through rejected or
-- cancelled. Only the chain watcher writes confirmed, and only with the hash
-- of a transaction it read: nothing marks itself paid.
create table if not exists billing_withdrawals (
  id bigserial primary key,
  -- The ledger account rather than only the user, because a rejection has to
  -- return the hold somewhere even if the user row is gone by then.
  account_id bigint not null references billing_accounts(id) on delete restrict,
  user_id bigint references users(id) on delete set null,
  amount_nano numeric(40, 0) not null check (amount_nano > 0),
  -- Copied from user_ton_wallets at request time, raw form. The payout goes
  -- where the user was looking when they asked, not wherever the wallet row
  -- points by the time it is paid; approval re-checks the two still agree.
  destination text not null check (destination ~ '^0:[0-9a-f]{64}$'),
  -- The comment the operator puts on the payment. It is how an outbound
  -- transaction is tied back to this row.
  memo text not null unique,
  status text not null default 'requested' check (status in (
    'requested', 'approved', 'sent', 'confirmed', 'rejected', 'cancelled'
  )),
  tx_hash text,
  decided_by bigint references users(id) on delete set null,
  reject_reason text,
  approved_at timestamptz,
  sent_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_withdrawals_confirmed_hash_check
    check ((status = 'confirmed') = (tx_hash is not null))
);

-- One open withdrawal per account. It keeps the operator's queue to one line
-- per person, and enforcing it here means two concurrent requests cannot both
-- get through.
create unique index if not exists billing_withdrawals_open_idx
  on billing_withdrawals(account_id) where status in ('requested', 'approved', 'sent');

create index if not exists billing_withdrawals_user_idx on billing_withdrawals(user_id, id);

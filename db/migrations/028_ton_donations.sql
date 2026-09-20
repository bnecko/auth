-- 028_ton_donations.sql
-- The donation ledger behind the donor badge. Watch-only: the server holds no
-- key and signs nothing, it reads transactions that arrived at an address the
-- operator controls and matches them to accounts by a per-user memo.
--
-- Amounts are nanocoins as an exact integer (numeric, never float): a GRAM is
-- 10^9 nano, and binary floating point cannot represent those cleanly.
--
-- Additive + idempotent; mirror in db/schema.sql.

create table if not exists ton_donation_memos (
  user_id bigint primary key references users(id) on delete cascade,
  memo text not null unique,
  created_at timestamptz not null default now()
);

-- tx_hash is the idempotency key: the sweep can re-read the same window after
-- a crash or an overlapping tick and the insert simply does nothing.
--
-- user_id is nulled rather than cascaded when an account goes away, so the row
-- survives as a financial record with the person detached from it.
create table if not exists ton_donations (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  tx_hash text not null unique,
  tx_lt numeric(20, 0) not null,
  amount_nano numeric(40, 0) not null check (amount_nano > 0),
  sender text,
  memo text,
  status text not null check (status in ('credited', 'unmatched')),
  tx_time timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ton_donations_user_idx on ton_donations(user_id);
create index if not exists ton_donations_status_created_idx on ton_donations(status, created_at);

-- Where the donation sweep has read up to. A table rather than Redis because
-- losing it would mean re-reading from the chain's beginning or, worse,
-- skipping donations that arrived while it was gone.
create table if not exists worker_cursors (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table users add column if not exists donor_since timestamptz;
alter table users add column if not exists public_show_donor boolean not null default true;

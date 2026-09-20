-- 030_deposit_memos.sql
-- A second memo per user, for topping up a btGRAM balance.
--
-- Deposits and donations arrive at the same address, so the memo is the only
-- thing that says which one a payment is. They cannot share a memo: a donation
-- is a gift that earns a badge, a deposit is a balance the user can spend and
-- withdraw, and crediting one as the other is not correctable by an apology.
--
-- Its own table rather than a purpose column on ton_donation_memos, whose
-- primary key is user_id and would have to be rebuilt to allow two rows per
-- user. Separate tables also keep the two concerns apart: one is a gift
-- record, the other is a claim.
--
-- Additive + idempotent; mirror in db/schema.sql.

create table if not exists billing_deposit_memos (
  user_id bigint primary key references users(id) on delete cascade,
  memo text not null unique,
  created_at timestamptz not null default now()
);

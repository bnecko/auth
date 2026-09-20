-- 027_ton_wallets.sql
-- A verified TON wallet per user, proved by a TON Connect signature rather
-- than by a payment. Its own table rather than columns on users: the wallet is
-- absent for almost every account, unlinking is then a row delete, and the
-- session hot path does not have to select three more columns.
--
-- address is the raw form only (workchain 0, lowercase hex). The friendly
-- base64 spellings are display-only, and one account has four of them, so
-- storing whichever spelling a wallet sent would let the same wallet link
-- twice and defeat the unique index that stops two accounts claiming it.
--
-- Additive + idempotent; mirror in db/schema.sql.

create table if not exists user_ton_wallets (
  user_id bigint primary key references users(id) on delete cascade,
  address text not null unique
    constraint user_ton_wallets_address_raw_check check (address ~ '^0:[0-9a-f]{64}$'),
  wallet_version text not null,
  verified_at timestamptz not null default now(),
  display text not null default 'hidden'
    check (display in ('hidden', 'address', 'domain')),
  display_domain text,
  domain_checked_at timestamptz,
  -- A domain is only ever displayed alongside the name being displayed, so the
  -- two cannot drift apart: clearing one clears the other.
  constraint user_ton_wallets_display_domain_check
    check ((display = 'domain') = (display_domain is not null)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Feeds the re-check sweep. A .ton domain is a transferable NFT, so a name
-- shown on a profile has to be re-verified on a schedule or a sold domain
-- keeps vouching for its previous owner.
create index if not exists user_ton_wallets_domain_recheck_idx
  on user_ton_wallets(domain_checked_at) where display = 'domain';

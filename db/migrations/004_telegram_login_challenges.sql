create table telegram_login_challenges (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint not null references users(id) on delete cascade,
  start_token_hash text not null unique,
  browser_token_hash text not null unique,
  remember_me boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired', 'cancelled')),
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz
);

create index telegram_login_challenges_user_idx on telegram_login_challenges(user_id);
create index telegram_login_challenges_status_idx on telegram_login_challenges(status);
create index telegram_login_challenges_expires_at_idx on telegram_login_challenges(expires_at);

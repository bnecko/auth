create table users (
  id bigserial primary key,
  public_id text not null unique,
  first_name text not null,
  username text not null,
  username_normalized text not null unique,
  bio text,
  email text not null,
  email_normalized text not null unique,
  email_verified_at timestamptz,
  dob date,
  password_hash text not null,
  telegram_id text unique,
  telegram_username text,
  telegram_verified_at timestamptz,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('pending', 'active', 'limited', 'banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  session_hash text not null unique,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index sessions_user_id_idx on sessions(user_id);
create index sessions_expires_at_idx on sessions(expires_at);

create table external_apps (
  id bigserial primary key,
  public_id text not null unique,
  name text not null,
  slug text not null unique,
  owner_user_id bigint references users(id) on delete set null,
  api_key_hash text not null unique,
  callback_url text,
  allowed_redirect_urls text[] not null default '{}',
  required_product text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activation_requests (
  id bigserial primary key,
  public_id text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired', 'cancelled')),
  requested_subject text,
  approved_user_id bigint references users(id) on delete set null,
  scopes text[] not null default '{}',
  callback_url text,
  return_url text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  denied_at timestamptz,
  cancelled_at timestamptz
);

create index activation_requests_app_idx on activation_requests(external_app_id);
create index activation_requests_status_idx on activation_requests(status);
create index activation_requests_expires_at_idx on activation_requests(expires_at);

create table subscriptions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  product text not null,
  status text not null check (status in ('active', 'expired', 'revoked', 'trial')),
  starts_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_product_idx on subscriptions(user_id, product);

create table app_authorizations (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, external_app_id)
);

create table registration_requests (
  id bigserial primary key,
  public_id text not null unique,
  first_name text not null,
  username text not null,
  username_normalized text not null,
  bio text,
  email text not null,
  email_normalized text not null,
  dob date,
  password_hash text not null,
  verification_code_hash text not null unique,
  telegram_id text,
  telegram_username text,
  user_id bigint references users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'completed', 'expired', 'cancelled')),
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  completed_at timestamptz
);

create index registration_requests_status_idx on registration_requests(status);
create index registration_requests_expires_at_idx on registration_requests(expires_at);

create table security_events (
  id bigserial primary key,
  user_id bigint references users(id) on delete set null,
  event_type text not null,
  result text not null,
  ip text,
  user_agent text,
  country text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index security_events_user_id_idx on security_events(user_id);
create index security_events_ip_created_at_idx on security_events(ip, created_at);

-- User-initiated requests for an external_apps API bearer key. The
-- requesting user fills in app name + reason; an admin reviews via
-- Telegram inline buttons. On approval we generate a key, insert an
-- external_apps row with its sha256 hash, and stash the plaintext on
-- this row so the user can reveal it once on their dashboard. On the
-- "I saved it" click we clear plaintext_key and only the hash remains.
create table bearer_requests (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint not null references users(id) on delete cascade,
  app_name text not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cleared')),
  external_app_id bigint references external_apps(id) on delete set null,
  plaintext_key text,
  decided_by_telegram_id text,
  decided_at timestamptz,
  revealed_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);

create index bearer_requests_user_id_idx on bearer_requests(user_id);
create index bearer_requests_status_idx on bearer_requests(status);

create table bans (
  id bigserial primary key,
  user_id bigint references users(id) on delete cascade,
  kind text not null check (kind in ('account', 'email', 'telegram_id', 'ip', 'subnet', 'asn')),
  value_hash text,
  reason text,
  created_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index bans_user_id_idx on bans(user_id);
create index bans_kind_value_idx on bans(kind, value_hash);

create table oauth_authorization_codes (
  id bigserial primary key,
  code_hash text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null check (code_challenge_method in ('S256')),
  scopes text[] not null default '{}',
  nonce text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index oauth_authorization_codes_app_idx on oauth_authorization_codes(external_app_id);
create index oauth_authorization_codes_user_idx on oauth_authorization_codes(user_id);
create index oauth_authorization_codes_expires_at_idx on oauth_authorization_codes(expires_at);

create table oauth_access_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index oauth_access_tokens_app_idx on oauth_access_tokens(external_app_id);
create index oauth_access_tokens_user_idx on oauth_access_tokens(user_id);
create index oauth_access_tokens_expires_at_idx on oauth_access_tokens(expires_at);

create table oauth_refresh_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_hash text
);

create index oauth_refresh_tokens_app_idx on oauth_refresh_tokens(external_app_id);
create index oauth_refresh_tokens_user_idx on oauth_refresh_tokens(user_id);
create index oauth_refresh_tokens_expires_at_idx on oauth_refresh_tokens(expires_at);

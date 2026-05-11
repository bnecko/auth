alter table external_apps
  add column if not exists oauth_client_secret_hash text,
  add column if not exists client_type text not null default 'confidential',
  add column if not exists token_endpoint_auth_method text not null default 'client_secret_post',
  add column if not exists allowed_grant_types text[] not null default array['authorization_code', 'refresh_token'],
  add column if not exists allowed_scopes text[] not null default array['openid', 'profile', 'email', 'profile:read', 'email:read'],
  add column if not exists issue_refresh_tokens boolean not null default true;

update external_apps
   set oauth_client_secret_hash = coalesce(oauth_client_secret_hash, api_key_hash)
 where oauth_client_secret_hash is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'external_apps_client_type_check'
  ) then
    alter table external_apps
      add constraint external_apps_client_type_check
      check (client_type in ('public', 'confidential'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'external_apps_token_endpoint_auth_method_check'
  ) then
    alter table external_apps
      add constraint external_apps_token_endpoint_auth_method_check
      check (token_endpoint_auth_method in ('client_secret_basic', 'client_secret_post', 'none'));
  end if;
end $$;

create table if not exists external_app_oauth_secrets (
  id bigserial primary key,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  secret_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists external_app_oauth_secrets_app_idx
  on external_app_oauth_secrets(external_app_id);

alter table oauth_access_tokens
  alter column user_id drop not null,
  add column if not exists subject text,
  add column if not exists token_kind text not null default 'user';

update oauth_access_tokens oat
   set subject = u.public_id
  from users u
 where oat.user_id = u.id
   and oat.subject is null;

update oauth_access_tokens oat
   set subject = ea.public_id,
       token_kind = 'client'
  from external_apps ea
 where oat.external_app_id = ea.id
   and oat.subject is null;

alter table oauth_access_tokens
  alter column subject set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'oauth_access_tokens_token_kind_check'
  ) then
    alter table oauth_access_tokens
      add constraint oauth_access_tokens_token_kind_check
      check (token_kind in ('user', 'client'));
  end if;
end $$;

create table if not exists webauthn_credentials (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  credential_id text not null unique,
  public_key bytea not null,
  sign_count bigint not null default 0,
  transports text[] not null default '{}',
  name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists webauthn_credentials_user_idx on webauthn_credentials(user_id);

create table if not exists oauth_pushed_requests (
  id bigserial primary key,
  request_uri_hash text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  scopes text[] not null default '{}',
  redirect_uri text not null,
  state text,
  code_challenge text,
  code_challenge_method text,
  nonce text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists oauth_pushed_requests_expires_at_idx
  on oauth_pushed_requests(expires_at);

create table if not exists oauth_device_codes (
  id bigserial primary key,
  device_code_hash text not null unique,
  user_code_hash text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  user_id bigint references users(id) on delete cascade,
  scopes text[] not null default '{}',
  status text not null default 'pending',
  poll_interval_seconds integer not null default 5,
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists oauth_device_codes_user_code_idx on oauth_device_codes(user_code_hash);
create index if not exists oauth_device_codes_expires_at_idx on oauth_device_codes(expires_at);

alter table oauth_device_codes
  add column if not exists poll_interval_seconds integer not null default 5,
  add column if not exists last_polled_at timestamptz,
  add column if not exists consumed_at timestamptz;

alter table oauth_device_codes
  drop constraint if exists oauth_device_codes_status_check,
  add constraint oauth_device_codes_status_check
  check (status in ('pending', 'approved', 'denied', 'expired', 'consumed'));

update oauth_device_codes
   set status = 'consumed',
       consumed_at = coalesce(consumed_at, now())
 where status = 'expired'
   and user_id is not null
   and consumed_at is null;

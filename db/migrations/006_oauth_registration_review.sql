create table if not exists oauth_client_registration_requests (
  id bigserial primary key,
  public_id text not null unique,
  registration_token_hash text not null unique,
  client_name text not null,
  redirect_uris text[] not null default '{}',
  grant_types text[] not null default '{}',
  scopes text[] not null default '{}',
  token_endpoint_auth_method text not null
    check (token_endpoint_auth_method in ('client_secret_basic', 'client_secret_post', 'none')),
  client_type text not null check (client_type in ('public', 'confidential')),
  oauth_profile_version text not null default 'bn-oauth-2026-05',
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired')),
  requester_ip text,
  requester_user_agent text,
  requester_country text,
  external_app_id bigint references external_apps(id) on delete set null,
  plaintext_client_secret text,
  client_secret_revealed_at timestamptz,
  reviewed_by_user_id bigint references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists oauth_client_registration_requests_status_idx
  on oauth_client_registration_requests(status, created_at);

create index if not exists oauth_client_registration_requests_expires_at_idx
  on oauth_client_registration_requests(expires_at);

alter table oauth_client_registration_requests
  add column if not exists oauth_profile_version text not null default 'bn-oauth-2026-05';

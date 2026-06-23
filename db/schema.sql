create table users (
  id bigserial primary key,
  public_id text not null unique,
  first_name text not null,
  constraint users_first_name_length_check check (length(first_name) <= 80),
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
  avatar_preset smallint,
  restricted boolean not null default false,
  restricted_at timestamptz,
  deactivated_at timestamptz,
  deletion_requested_at timestamptz,
  notify_security_receipts boolean not null default true,
  notify_signin_alerts boolean not null default true,
  profile_public boolean not null default true,
  discoverable_by_username boolean not null default true,
  public_show_telegram boolean not null default true,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('pending', 'active', 'limited', 'banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_restricted_idx on users(id) where restricted;
create index users_deletion_requested_idx on users(deletion_requested_at) where deletion_requested_at is not null;

create table profile_change_requests (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint not null references users(id) on delete cascade,
  field text not null check (field in ('username', 'email')),
  new_value text not null,
  new_value_normalized text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'expired', 'cancelled', 'completed')),
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);

create index profile_change_requests_user_idx on profile_change_requests(user_id);
create index profile_change_requests_status_idx on profile_change_requests(status);
create index profile_change_requests_expires_idx on profile_change_requests(expires_at);

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
  oauth_client_secret_hash text,
  callback_url text,
  allowed_redirect_urls text[] not null default '{}',
  post_logout_redirect_urls text[] not null default '{}',
  client_type text not null default 'confidential' check (client_type in ('public', 'confidential')),
  token_endpoint_auth_method text not null default 'client_secret_post'
    check (token_endpoint_auth_method in ('client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none')),
  allowed_grant_types text[] not null default array['authorization_code', 'refresh_token'],
  allowed_scopes text[] not null default array['openid', 'profile', 'email', 'profile:read', 'email:read'],
  issue_refresh_tokens boolean not null default true,
  oauth_profile_version text not null default 'bn-oauth-2026-05',
  jwks_uri text,
  jwks jsonb,
  required_product text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column external_apps.oauth_client_secret_hash is
  'Hash of the current client secret. Confidential clients using client_secret_basic or client_secret_post have a value; public clients and private_key_jwt/none auth are null. Rotated secrets move to external_app_oauth_secrets with an expiry.';

create table external_app_oauth_secrets (
  id bigserial primary key,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  secret_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index external_app_oauth_secrets_app_idx on external_app_oauth_secrets(external_app_id);

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
  denied_reason text,
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
  updated_at timestamptz not null default now(),
  constraint subscriptions_user_id_product_key unique (user_id, product)
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
create index security_events_created_at_idx on security_events(created_at);

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
    check (status in ('pending', 'approved', 'rejected', 'cleared', 'revoked')),
  external_app_id bigint references external_apps(id) on delete set null,
  plaintext_key text,
  created_by_telegram_id text,
  decided_by_telegram_id text,
  decided_at timestamptz,
  revealed_at timestamptz,
  cleared_at timestamptz,
  revoked_at timestamptz,
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
create unique index bans_active_kind_value_idx
  on bans(kind, value_hash)
  where revoked_at is null and value_hash is not null;

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
  consumed_at timestamptz,
  auth_time timestamptz
);

create index oauth_authorization_codes_app_idx on oauth_authorization_codes(external_app_id);
create index oauth_authorization_codes_user_idx on oauth_authorization_codes(user_id);
create index oauth_authorization_codes_expires_at_idx on oauth_authorization_codes(expires_at);

create table oauth_access_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  user_id bigint references users(id) on delete cascade,
  subject text not null,
  token_kind text not null default 'user' check (token_kind in ('user', 'client')),
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
  replaced_by_hash text,
  auth_time timestamptz
);

create table oauth_client_assertion_jtis (
  id bigserial primary key,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  jti text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index oauth_client_assertion_jtis_app_jti_idx
  on oauth_client_assertion_jtis(external_app_id, jti);

create index oauth_client_assertion_jtis_expires_at_idx
  on oauth_client_assertion_jtis(expires_at);

create index oauth_refresh_tokens_app_idx on oauth_refresh_tokens(external_app_id);
create index oauth_refresh_tokens_user_idx on oauth_refresh_tokens(user_id);
create index oauth_refresh_tokens_expires_at_idx on oauth_refresh_tokens(expires_at);

create table telegram_login_challenges (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint not null references users(id) on delete cascade,
  start_token_hash text not null unique,
  browser_token_hash text not null unique,
  remember_me boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'verified', 'expired', 'cancelled')),
  code_hash text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz
);

create index telegram_login_challenges_user_idx on telegram_login_challenges(user_id);
create index telegram_login_challenges_status_idx on telegram_login_challenges(status);
create index telegram_login_challenges_expires_at_idx on telegram_login_challenges(expires_at);

create table webauthn_credentials (
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

create index webauthn_credentials_user_idx on webauthn_credentials(user_id);

create table oauth_pushed_requests (
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
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index oauth_pushed_requests_expires_at_idx on oauth_pushed_requests(expires_at);
create index oauth_pushed_requests_consumed_at_idx on oauth_pushed_requests(consumed_at);

create table oauth_device_codes (
  id bigserial primary key,
  device_code_hash text not null unique,
  user_code_hash text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  user_id bigint references users(id) on delete cascade,
  scopes text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired', 'consumed')),
  poll_interval_seconds integer not null default 5,
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index oauth_device_codes_user_code_idx on oauth_device_codes(user_code_hash);
create index oauth_device_codes_expires_at_idx on oauth_device_codes(expires_at);

create table oauth_client_registration_requests (
  id bigserial primary key,
  public_id text not null unique,
  registration_token_hash text not null unique,
  client_name text not null,
  redirect_uris text[] not null default '{}',
  grant_types text[] not null default '{}',
  scopes text[] not null default '{}',
  token_endpoint_auth_method text not null
    constraint dcr_requests_token_auth_method_check
    check (token_endpoint_auth_method in ('client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none')),
  client_type text not null check (client_type in ('public', 'confidential')),
  oauth_profile_version text not null default 'bn-oauth-2026-05',
  jwks_uri text,
  jwks jsonb,
  post_logout_redirect_uris text[] not null default '{}',
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

create index oauth_client_registration_requests_status_idx
  on oauth_client_registration_requests(status, created_at);

create index oauth_client_registration_requests_expires_at_idx
  on oauth_client_registration_requests(expires_at);

create table webhook_endpoints (
  id bigserial primary key,
  public_id text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  url text not null,
  event_types text[] not null default '{}',
  secret text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz
);

create index webhook_endpoints_app_idx on webhook_endpoints(external_app_id);
create index webhook_endpoints_status_idx on webhook_endpoints(status);

create table webhook_deliveries (
  id bigserial primary key,
  public_id text not null unique,
  webhook_endpoint_id bigint not null references webhook_endpoints(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed', 'cancelled')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  response_status integer,
  response_body text,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index webhook_deliveries_endpoint_idx on webhook_deliveries(webhook_endpoint_id, created_at);
create index webhook_deliveries_status_idx on webhook_deliveries(status, next_attempt_at);

create table support_threads (
  id bigserial primary key,
  public_id text not null unique,
  kind text not null check (kind in ('ticket', 'issue', 'security')),
  visibility text not null check (visibility in ('public', 'private')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  author_user_id bigint not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  claimed_by_user_id bigint references users(id) on delete set null,
  claimed_at timestamptz,
  solved_at timestamptz,
  star_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_threads_author_idx on support_threads(author_user_id);
create index support_threads_claimed_by_idx on support_threads(claimed_by_user_id);
create index support_threads_public_stars_idx
  on support_threads(visibility, star_count desc, created_at desc);
create index support_threads_visibility_status_idx
  on support_threads(visibility, status);

create table support_messages (
  id bigserial primary key,
  public_id text not null unique,
  thread_id bigint not null references support_threads(id) on delete cascade,
  author_user_id bigint not null references users(id) on delete cascade,
  body text not null,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index support_messages_thread_idx on support_messages(thread_id, created_at);

create table support_stars (
  id bigserial primary key,
  thread_id bigint not null references support_threads(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create table support_team (
  id bigserial primary key,
  user_id bigint not null unique references users(id) on delete cascade,
  added_by_user_id bigint references users(id) on delete set null,
  role text not null default 'supporter'
    check (role in ('supporter', 'security', 'security_high')),
  created_at timestamptz not null default now()
);

create table support_thread_supporters (
  id bigserial primary key,
  thread_id bigint not null references support_threads(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  invited_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create index support_thread_supporters_thread_idx on support_thread_supporters(thread_id);
create index support_thread_supporters_user_idx on support_thread_supporters(user_id);

create table support_thread_revisions (
  id bigserial primary key,
  public_id text not null unique,
  thread_id bigint not null references support_threads(id) on delete cascade,
  edited_by_user_id bigint not null references users(id) on delete cascade,
  title_before text not null,
  title_after text not null,
  body_before text not null,
  body_after text not null,
  created_at timestamptz not null default now()
);

create index support_thread_revisions_thread_idx
  on support_thread_revisions(thread_id, created_at);
create index support_threads_public_status_idx
  on support_threads(visibility, status, star_count desc);

create table user_restrictions (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint not null references users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'appealed', 'closed', 'lifted')),
  trigger_type text not null,
  trigger_code text not null unique,
  reason text,
  security_thread_id bigint references support_threads(id) on delete set null,
  suspicion_event_id bigint,
  restricted_by_user_id bigint references users(id) on delete set null,
  last_user_activity_at timestamptz,
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);

create unique index user_restrictions_active_user_idx
  on user_restrictions(user_id) where status = 'active';
create index user_restrictions_status_activity_idx
  on user_restrictions(status, last_user_activity_at);

create table suspicion_events (
  id bigserial primary key,
  public_id text not null unique,
  user_id bigint references users(id) on delete cascade,
  trigger_type text not null,
  score integer not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'actioned', 'dismissed')),
  reviewed_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index suspicion_events_status_created_idx
  on suspicion_events(status, created_at);
create index suspicion_events_user_idx on suspicion_events(user_id);

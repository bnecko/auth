-- private_key_jwt client authentication (RFC 7521 + RFC 7523).
--
-- Adds support for the fourth standard token_endpoint_auth_method,
-- where the client proves possession of a private key by signing a
-- short-lived JWT assertion. Required by enterprise OIDC integrators
-- and FAPI baseline. The client's verification material lives either
-- inline (jwks) or as a fetchable URL (jwks_uri); exactly one should
-- be populated when the method is selected.
--
-- Replay protection uses an opaque jti table — every accepted client
-- assertion's jti is recorded with its exp; the worker can prune
-- expired rows. Composite uniqueness on (external_app_id, jti) keeps
-- the table tight without blocking legitimate reuse of jti values
-- across different clients.
--
-- Refresh tokens grow an auth_time column so RP-Initiated Logout and
-- max_age-conscious clients can read a stable auth_time claim from
-- ID tokens issued via refresh, not just from the original code
-- exchange.
--
-- DCR registration requests carry post_logout_redirect_uris so the
-- field can be supplied at registration time rather than added by
-- the developer dashboard after approval.

-- external_apps.token_endpoint_auth_method: allow private_key_jwt.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'external_apps_token_endpoint_auth_method_check'
  ) then
    alter table external_apps
      drop constraint external_apps_token_endpoint_auth_method_check;
  end if;
  alter table external_apps
    add constraint external_apps_token_endpoint_auth_method_check
    check (token_endpoint_auth_method in (
      'client_secret_basic',
      'client_secret_post',
      'private_key_jwt',
      'none'
    ));
end $$;

alter table external_apps
  add column if not exists jwks_uri text,
  add column if not exists jwks jsonb;

-- oauth_client_registration_requests: same constraint + new fields.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'oauth_client_registration_requests_token_endpoint_auth_method_check'
  ) then
    alter table oauth_client_registration_requests
      drop constraint oauth_client_registration_requests_token_endpoint_auth_method_check;
  end if;
  alter table oauth_client_registration_requests
    add constraint oauth_client_registration_requests_token_endpoint_auth_method_check
    check (token_endpoint_auth_method in (
      'client_secret_basic',
      'client_secret_post',
      'private_key_jwt',
      'none'
    ));
end $$;

alter table oauth_client_registration_requests
  add column if not exists jwks_uri text,
  add column if not exists jwks jsonb,
  add column if not exists post_logout_redirect_uris text[] not null default '{}';

-- Refresh tokens carry auth_time so the rotated ID token's auth_time
-- claim stays anchored to the original first-factor authentication
-- moment, not to the most recent refresh.
alter table oauth_refresh_tokens
  add column if not exists auth_time timestamptz;

-- jti tracking for private_key_jwt assertion replay protection.
create table if not exists oauth_client_assertion_jtis (
  id bigserial primary key,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  jti text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists oauth_client_assertion_jtis_app_jti_idx
  on oauth_client_assertion_jtis(external_app_id, jti);

create index if not exists oauth_client_assertion_jtis_expires_at_idx
  on oauth_client_assertion_jtis(expires_at);

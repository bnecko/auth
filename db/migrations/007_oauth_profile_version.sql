alter table external_apps
  add column if not exists oauth_profile_version text not null default 'bn-oauth-2026-05';

alter table oauth_client_registration_requests
  add column if not exists oauth_profile_version text not null default 'bn-oauth-2026-05';

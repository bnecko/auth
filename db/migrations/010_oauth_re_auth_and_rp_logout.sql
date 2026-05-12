-- OIDC re-authentication enforcement + RP-initiated logout.
--
-- `auth_time` carries the timestamp of the first-factor login through
-- the authorization code so the ID token at exchange time can report
-- when the user actually authenticated (RFC 8176 / OIDC core).
--
-- `post_logout_redirect_urls` is the client-side allowlist used by the
-- end_session_endpoint to decide where to send the user after logout.
-- An empty allowlist means the auth service will not redirect; it will
-- show a confirmation page instead.

alter table oauth_authorization_codes
  add column if not exists auth_time timestamptz;

alter table external_apps
  add column if not exists post_logout_redirect_urls text[] not null default '{}';

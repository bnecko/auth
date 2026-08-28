-- Owner-initiated freeze for external apps. 'frozen' suspends the app the
-- same way 'disabled' does (every enforcement path requires status =
-- 'active'), but the owner can reverse it from the dashboard, while
-- 'disabled' stays an admin-only state. Mirror in db/schema.sql.

alter table external_apps drop constraint external_apps_status_check;
alter table external_apps add constraint external_apps_status_check
  check (status in ('active', 'frozen', 'disabled'));

comment on column external_apps.status is
  'active: live. frozen: suspended by the owner, owner-reversible. disabled: suspended by an admin; the owner cannot re-enable it. Anything other than active blocks all OAuth flows, issued tokens, and the activation API.';

-- 024_email_change_completed.sql
-- Email changes now require the NEW address to be confirmed by a 6-digit code
-- before they apply. For an email request, 'approved' becomes the transient
-- "Telegram-authorized, awaiting email code" state and 'completed' is the new
-- terminal applied state. (Username changes still apply at approve time.)
-- Additive + idempotent; mirror in db/schema.sql.

do $$
begin
  alter table profile_change_requests
    drop constraint if exists profile_change_requests_status_check;
  alter table profile_change_requests
    add constraint profile_change_requests_status_check
    check (status in ('pending', 'approved', 'denied', 'expired', 'cancelled', 'completed'));
end $$;

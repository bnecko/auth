-- Webhook secrets must be retrievable at delivery time so the worker
-- can sign each outgoing request. Storing only a hash made the
-- existing schema unusable. Rename secret_hash to secret and store
-- plaintext, matching the Stripe/GitHub convention. The trust boundary
-- is the database itself; rotation is handled by re-registering the
-- endpoint, which is why one-time reveal is unnecessary here.

alter table webhook_endpoints
  add column if not exists secret text;

-- Existing rows (if any) have only a hash and cannot be migrated to a
-- plaintext secret. Disable them so the worker skips them and the app
-- owner re-registers the endpoint.
update webhook_endpoints
   set status = 'disabled',
       disabled_at = coalesce(disabled_at, now())
 where secret is null;

alter table webhook_endpoints
  drop column if exists secret_hash;

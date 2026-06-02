-- Auto-disable endpoints whose deliveries keep failing, so a
-- permanently-dead receiver stops generating retry load indefinitely.
-- The worker increments this counter each time a delivery exhausts its
-- retries and resets it to zero on the first success; once it reaches
-- the threshold the worker flips the endpoint to 'disabled'.
alter table webhook_endpoints
  add column if not exists consecutive_failures integer not null default 0;

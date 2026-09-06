-- Heartbeats received from inside the host, one row per source.
create table heartbeats (
  name text primary key,
  last_seen_at integer not null
);

-- Current state of every check; rows are written only on change plus the
-- failure counter, so the write budget stays a fraction of the free tier.
create table checks (
  name text primary key,
  status text not null check (status in ('up', 'down')),
  since integer not null,
  failures integer not null default 0,
  detail text
);

-- Small key/value state: which daily summaries have gone out.
create table monitor_state (
  key text primary key,
  value text not null
);

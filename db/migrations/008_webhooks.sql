create table if not exists webhook_endpoints (
  id bigserial primary key,
  public_id text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  url text not null,
  event_types text[] not null default '{}',
  secret_hash text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz
);

create index if not exists webhook_endpoints_app_idx on webhook_endpoints(external_app_id);
create index if not exists webhook_endpoints_status_idx on webhook_endpoints(status);

create table if not exists webhook_deliveries (
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

create index if not exists webhook_deliveries_endpoint_idx on webhook_deliveries(webhook_endpoint_id, created_at);
create index if not exists webhook_deliveries_status_idx on webhook_deliveries(status, next_attempt_at);

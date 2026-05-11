create table if not exists oauth_authorization_codes (
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
  consumed_at timestamptz
);

create index if not exists oauth_authorization_codes_app_idx on oauth_authorization_codes(external_app_id);
create index if not exists oauth_authorization_codes_user_idx on oauth_authorization_codes(user_id);
create index if not exists oauth_authorization_codes_expires_at_idx on oauth_authorization_codes(expires_at);

create table if not exists oauth_access_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists oauth_access_tokens_app_idx on oauth_access_tokens(external_app_id);
create index if not exists oauth_access_tokens_user_idx on oauth_access_tokens(user_id);
create index if not exists oauth_access_tokens_expires_at_idx on oauth_access_tokens(expires_at);

create table if not exists oauth_refresh_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  external_app_id bigint not null references external_apps(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_hash text
);

create index if not exists oauth_refresh_tokens_app_idx on oauth_refresh_tokens(external_app_id);
create index if not exists oauth_refresh_tokens_user_idx on oauth_refresh_tokens(user_id);
create index if not exists oauth_refresh_tokens_expires_at_idx on oauth_refresh_tokens(expires_at);

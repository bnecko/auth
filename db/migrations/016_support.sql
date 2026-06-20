-- 016_support.sql
-- Community support: a public issue tracker plus private support threads.
--
-- Additive and idempotent so it survives both migration-smoke paths: a fresh
-- DB running every migration, and db/schema.sql applied first with the
-- migrations run on top (the `if not exists` guards make each statement a
-- no-op when schema.sql already created the object). Mirror any change here in
-- db/schema.sql.

-- A thread is either a community `issue` (not claimable) or a support
-- `ticket` (claimable 1:1 by a supporter). `visibility` decides who can read
-- it; `star_count` is denormalized so the public list can sort by popularity
-- without a join.
create table if not exists support_threads (
  id bigserial primary key,
  public_id text not null unique,
  kind text not null check (kind in ('ticket', 'issue')),
  visibility text not null check (visibility in ('public', 'private')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  author_user_id bigint not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  claimed_by_user_id bigint references users(id) on delete set null,
  claimed_at timestamptz,
  solved_at timestamptz,
  star_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_threads_author_idx
  on support_threads(author_user_id);
create index if not exists support_threads_claimed_by_idx
  on support_threads(claimed_by_user_id);
-- Public list, newest or most-starred first.
create index if not exists support_threads_public_stars_idx
  on support_threads(visibility, star_count desc, created_at desc);
-- Supporter/admin inbox filtering by status.
create index if not exists support_threads_visibility_status_idx
  on support_threads(visibility, status);

-- Replies. `internal` notes are visible to supporters/admins only, never the
-- thread author.
create table if not exists support_messages (
  id bigserial primary key,
  public_id text not null unique,
  thread_id bigint not null references support_threads(id) on delete cascade,
  author_user_id bigint not null references users(id) on delete cascade,
  body text not null,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_thread_idx
  on support_messages(thread_id, created_at);

-- One star per (thread, user). star_count on support_threads is bumped in the
-- same transaction as inserting/deleting a row here.
create table if not exists support_stars (
  id bigserial primary key,
  thread_id bigint not null references support_threads(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

-- The supporter roster: admin-granted, distinct from the admin role.
create table if not exists support_team (
  id bigserial primary key,
  user_id bigint not null unique references users(id) on delete cascade,
  added_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Supporters invited onto a claimed ticket, in addition to the claimer.
create table if not exists support_thread_supporters (
  id bigserial primary key,
  thread_id bigint not null references support_threads(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  invited_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create index if not exists support_thread_supporters_thread_idx
  on support_thread_supporters(thread_id);
create index if not exists support_thread_supporters_user_idx
  on support_thread_supporters(user_id);

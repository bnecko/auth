-- 018_support_v2.sql
-- Support v2: public edit history for threads, plus a status-aware index for the
-- filtered public board. Additive + idempotent; mirror in db/schema.sql.

create table if not exists support_thread_revisions (
  id bigserial primary key,
  public_id text not null unique,
  thread_id bigint not null references support_threads(id) on delete cascade,
  edited_by_user_id bigint not null references users(id) on delete cascade,
  title_before text not null,
  title_after text not null,
  body_before text not null,
  body_after text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_thread_revisions_thread_idx
  on support_thread_revisions(thread_id, created_at);

-- Backs the status-filtered public board (All / Open / Resolved / Closed).
create index if not exists support_threads_public_status_idx
  on support_threads(visibility, status, star_count desc);

import { query, queryOne } from "../db";

export type SupportThreadKind = "ticket" | "issue" | "security";
export type SupportThreadVisibility = "public" | "private";
export type SupportThreadStatus = "open" | "in_progress" | "resolved" | "closed";

export type SupportThread = {
  id: number;
  publicId: string;
  kind: SupportThreadKind;
  visibility: SupportThreadVisibility;
  status: SupportThreadStatus;
  authorUserId: number;
  title: string;
  body: string;
  claimedByUserId: number | null;
  claimedAt: string | null;
  solvedAt: string | null;
  starCount: number;
  createdAt: string;
  updatedAt: string;
  // Populated only by the queries that join `users`; null otherwise.
  authorUsername: string | null;
  claimedByUsername: string | null;
};

export type SupportMessage = {
  id: number;
  publicId: string;
  threadId: number;
  authorUserId: number;
  body: string;
  internal: boolean;
  createdAt: string;
  authorUsername: string | null;
};

export type SupporterRole = "supporter" | "security" | "security_high";

export type SupportTeamMember = {
  userId: number;
  username: string;
  firstName: string;
  role: SupporterRole;
  addedByUserId: number | null;
  createdAt: string;
};

export type SupportThreadSupporter = {
  userId: number;
  username: string;
  invitedByUserId: number | null;
  createdAt: string;
};

export type SupportThreadRevision = {
  id: number;
  publicId: string;
  threadId: number;
  editedByUserId: number;
  editorUsername: string | null;
  titleBefore: string;
  titleAfter: string;
  bodyBefore: string;
  bodyAfter: string;
  createdAt: string;
};

type SupportThreadRow = {
  id: string;
  public_id: string;
  kind: SupportThreadKind;
  visibility: SupportThreadVisibility;
  status: SupportThreadStatus;
  author_user_id: string;
  title: string;
  body: string;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  solved_at: string | null;
  star_count: number;
  created_at: string;
  updated_at: string;
  author_username?: string | null;
  claimed_by_username?: string | null;
};

type SupportMessageRow = {
  id: string;
  public_id: string;
  thread_id: string;
  author_user_id: string;
  body: string;
  internal: boolean;
  created_at: string;
  author_username?: string | null;
};

function mapThread(row: SupportThreadRow): SupportThread {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    kind: row.kind,
    visibility: row.visibility,
    status: row.status,
    authorUserId: Number(row.author_user_id),
    title: row.title,
    body: row.body,
    claimedByUserId: row.claimed_by_user_id ? Number(row.claimed_by_user_id) : null,
    claimedAt: row.claimed_at,
    solvedAt: row.solved_at,
    starCount: Number(row.star_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorUsername: row.author_username ?? null,
    claimedByUsername: row.claimed_by_username ?? null,
  };
}

function mapMessage(row: SupportMessageRow): SupportMessage {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    threadId: Number(row.thread_id),
    authorUserId: Number(row.author_user_id),
    body: row.body,
    internal: row.internal,
    createdAt: row.created_at,
    authorUsername: row.author_username ?? null,
  };
}

// Bare columns for insert/update RETURNING (no joins, so usernames are null).
const threadColumns = `
  id,
  public_id,
  kind,
  visibility,
  status,
  author_user_id,
  title,
  body,
  claimed_by_user_id,
  claimed_at::text,
  solved_at::text,
  star_count,
  created_at::text,
  updated_at::text
`;

// Same columns plus the author/claimer usernames, for finds and lists.
const threadSelect = `
  t.id,
  t.public_id,
  t.kind,
  t.visibility,
  t.status,
  t.author_user_id,
  t.title,
  t.body,
  t.claimed_by_user_id,
  t.claimed_at::text,
  t.solved_at::text,
  t.star_count,
  t.created_at::text,
  t.updated_at::text,
  author.username as author_username,
  claimer.username as claimed_by_username
`;

const threadFrom = `
  from support_threads t
  join users author on author.id = t.author_user_id
  left join users claimer on claimer.id = t.claimed_by_user_id
`;

export async function createSupportThread(input: {
  publicId: string;
  kind: SupportThreadKind;
  visibility: SupportThreadVisibility;
  authorUserId: number;
  title: string;
  body: string;
}) {
  const row = await queryOne<SupportThreadRow>(
    `insert into support_threads
       (public_id, kind, visibility, author_user_id, title, body)
     values ($1, $2, $3, $4, $5, $6)
     returning ${threadColumns}`,
    [
      input.publicId,
      input.kind,
      input.visibility,
      input.authorUserId,
      input.title,
      input.body,
    ],
  );
  if (!row) {
    throw new Error("failed to create support thread");
  }
  return mapThread(row);
}

export async function findSupportThreadByPublicId(publicId: string) {
  const row = await queryOne<SupportThreadRow>(
    `select ${threadSelect} ${threadFrom} where t.public_id = $1`,
    [publicId],
  );
  return row ? mapThread(row) : null;
}

export async function findSupportThreadById(id: number) {
  const row = await queryOne<SupportThreadRow>(
    `select ${threadSelect} ${threadFrom} where t.id = $1`,
    [id],
  );
  return row ? mapThread(row) : null;
}

// Public list for the open issue tracker: most-starred first, then newest.
// status: undefined = all; "open" includes in_progress so active work still shows.
export async function listPublicSupportThreads(
  status?: "open" | "resolved" | "closed",
  limit = 100,
) {
  const statuses =
    status === "open"
      ? ["open", "in_progress"]
      : status
        ? [status]
        : null;
  const rows = await query<SupportThreadRow>(
    `select ${threadSelect} ${threadFrom}
      where t.visibility = 'public'
        and ($2::text[] is null or t.status = any($2))
      order by t.star_count desc, t.created_at desc
      limit $1`,
    [limit, statuses],
  );
  return rows.map(mapThread);
}

// Edit title/body in a single atomic statement that also snapshots the previous
// values into support_thread_revisions. Status/solved_at/claimed_at are NOT
// touched, so editing never reopens or re-solves a thread.
export async function updateSupportThread(input: {
  publicId: string;
  revisionPublicId: string;
  editedByUserId: number;
  title: string;
  body: string;
}) {
  // The revision CTE snapshots the old title/body (read at statement start);
  // the UPDATE then writes the new values. The UPDATE has no FROM clause, so
  // its RETURNING columns are unambiguous. The data-modifying `rev` CTE runs
  // exactly once even though the main query does not reference it.
  const row = await queryOne<SupportThreadRow>(
    `with current as (
       select id, title, body from support_threads where public_id = $1
     ), rev as (
       insert into support_thread_revisions
         (public_id, thread_id, edited_by_user_id, title_before, title_after, body_before, body_after)
       select $2, c.id, $3, c.title, $4, c.body, $5 from current c
       returning id
     )
     update support_threads t
        set title = $4, body = $5, updated_at = now()
      where t.public_id = $1
      returning ${threadColumns}`,
    [input.publicId, input.revisionPublicId, input.editedByUserId, input.title, input.body],
  );
  return row ? mapThread(row) : null;
}

export async function listThreadRevisions(threadId: number) {
  const rows = await query<{
    id: string;
    public_id: string;
    thread_id: string;
    edited_by_user_id: string;
    editor_username: string | null;
    title_before: string;
    title_after: string;
    body_before: string;
    body_after: string;
    created_at: string;
  }>(
    `select r.id, r.public_id, r.thread_id, r.edited_by_user_id,
            u.username as editor_username,
            r.title_before, r.title_after, r.body_before, r.body_after,
            r.created_at::text
       from support_thread_revisions r
       join users u on u.id = r.edited_by_user_id
      where r.thread_id = $1
      order by r.created_at desc`,
    [threadId],
  );
  return rows.map(r => ({
    id: Number(r.id),
    publicId: r.public_id,
    threadId: Number(r.thread_id),
    editedByUserId: Number(r.edited_by_user_id),
    editorUsername: r.editor_username,
    titleBefore: r.title_before,
    titleAfter: r.title_after,
    bodyBefore: r.body_before,
    bodyAfter: r.body_after,
    createdAt: r.created_at,
  })) satisfies SupportThreadRevision[];
}

// Hard delete; FK cascade removes messages, stars, supporters, and revisions.
export async function deleteSupportThread(publicId: string) {
  const row = await queryOne<{ id: string }>(
    `delete from support_threads where public_id = $1 returning id`,
    [publicId],
  );
  return !!row;
}

export async function deleteSupportMessage(publicId: string) {
  const row = await queryOne<{ thread_id: string }>(
    `delete from support_messages where public_id = $1 returning thread_id`,
    [publicId],
  );
  if (row) {
    await query(`update support_threads set updated_at = now() where id = $1`, [
      Number(row.thread_id),
    ]);
  }
  return !!row;
}

export async function setSupportThreadVisibility(input: {
  publicId: string;
  visibility: SupportThreadVisibility;
}) {
  const row = await queryOne<SupportThreadRow>(
    `update support_threads
        set visibility = $2, updated_at = now()
      where public_id = $1
      returning ${threadColumns}`,
    [input.publicId, input.visibility],
  );
  return row ? mapThread(row) : null;
}

export async function listSupportThreadsForAuthor(authorUserId: number) {
  const rows = await query<SupportThreadRow>(
    `select ${threadSelect} ${threadFrom}
      where t.author_user_id = $1 and t.kind <> 'security'
      order by t.updated_at desc`,
    [authorUserId],
  );
  return rows.map(mapThread);
}

// Supporter/admin work queue: open + in-progress threads. Pass
// supporterUserId = null for an admin (sees everything); a supporter only sees
// threads that are unclaimed, claimed by them, or that they were invited onto.
export async function listSupportQueue(supporterUserId: number | null, limit = 200) {
  const rows = await query<SupportThreadRow>(
    `select ${threadSelect} ${threadFrom}
      where t.status in ('open', 'in_progress')
        and t.kind <> 'security'
        and (
          $1::bigint is null
          or t.claimed_by_user_id is null
          or t.claimed_by_user_id = $1
          or exists (
            select 1 from support_thread_supporters s
             where s.thread_id = t.id and s.user_id = $1
          )
        )
      order by t.updated_at desc
      limit $2`,
    [supporterUserId, limit],
  );
  return rows.map(mapThread);
}

// Claim is only valid for an unclaimed ticket; the status check makes a
// double-tap idempotent (the second claimer gets null).
export async function claimSupportThread(input: {
  publicId: string;
  supporterUserId: number;
}) {
  const row = await queryOne<SupportThreadRow>(
    `update support_threads
        set claimed_by_user_id = $2,
            claimed_at = now(),
            status = 'in_progress',
            updated_at = now()
      where public_id = $1
        and kind = 'ticket'
        and claimed_by_user_id is null
        and status in ('open', 'in_progress')
      returning ${threadColumns}`,
    [input.publicId, input.supporterUserId],
  );
  return row ? mapThread(row) : null;
}

export async function unclaimSupportThread(publicId: string) {
  const row = await queryOne<SupportThreadRow>(
    `update support_threads
        set claimed_by_user_id = null,
            claimed_at = null,
            status = 'open',
            updated_at = now()
      where public_id = $1
        and claimed_by_user_id is not null
      returning ${threadColumns}`,
    [publicId],
  );
  return row ? mapThread(row) : null;
}

export async function setSupportThreadStatus(input: {
  publicId: string;
  status: SupportThreadStatus;
}) {
  const solved = input.status === "resolved" || input.status === "closed";
  const row = await queryOne<SupportThreadRow>(
    `update support_threads
        set status = $2,
            solved_at = case when $3 then coalesce(solved_at, now()) else null end,
            updated_at = now()
      where public_id = $1
      returning ${threadColumns}`,
    [input.publicId, input.status, solved],
  );
  return row ? mapThread(row) : null;
}

export async function createSupportMessage(input: {
  publicId: string;
  threadId: number;
  authorUserId: number;
  body: string;
  internal: boolean;
}) {
  const row = await queryOne<SupportMessageRow>(
    `insert into support_messages
       (public_id, thread_id, author_user_id, body, internal)
     values ($1, $2, $3, $4, $5)
     returning id, public_id, thread_id, author_user_id, body, internal, created_at::text`,
    [
      input.publicId,
      input.threadId,
      input.authorUserId,
      input.body,
      input.internal,
    ],
  );
  if (!row) {
    throw new Error("failed to create support message");
  }
  // Surface new activity in list ordering.
  await query(`update support_threads set updated_at = now() where id = $1`, [
    input.threadId,
  ]);
  return mapMessage(row);
}

export async function listSupportMessages(input: {
  threadId: number;
  includeInternal: boolean;
}) {
  const rows = await query<SupportMessageRow>(
    `select m.id, m.public_id, m.thread_id, m.author_user_id, m.body,
            m.internal, m.created_at::text, author.username as author_username
       from support_messages m
       join users author on author.id = m.author_user_id
      where m.thread_id = $1
        and ($2 or m.internal = false)
      order by m.created_at asc`,
    [input.threadId, input.includeInternal],
  );
  return rows.map(mapMessage);
}

// Atomic star: insert the row (no-op on conflict) and bump star_count only
// when a row was actually inserted. Returns the new starred state + count.
export async function addSupportStar(threadId: number, userId: number) {
  const row = await queryOne<{ added: number; star_count: number }>(
    `with ins as (
       insert into support_stars (thread_id, user_id)
       values ($1, $2)
       on conflict (thread_id, user_id) do nothing
       returning id
     ), bumped as (
       update support_threads t
          set star_count = star_count + 1
        where t.id = $1 and exists (select 1 from ins)
        returning t.star_count
     )
     select (select count(*) from ins)::int as added,
            coalesce(
              (select star_count from bumped),
              (select star_count from support_threads where id = $1)
            ) as star_count`,
    [threadId, userId],
  );
  return { starred: true, added: (row?.added || 0) > 0, count: row?.star_count || 0 };
}

export async function removeSupportStar(threadId: number, userId: number) {
  const row = await queryOne<{ removed: number; star_count: number }>(
    `with del as (
       delete from support_stars
        where thread_id = $1 and user_id = $2
        returning id
     ), bumped as (
       update support_threads t
          set star_count = greatest(star_count - 1, 0)
        where t.id = $1 and exists (select 1 from del)
        returning t.star_count
     )
     select (select count(*) from del)::int as removed,
            coalesce(
              (select star_count from bumped),
              (select star_count from support_threads where id = $1)
            ) as star_count`,
    [threadId, userId],
  );
  return { starred: false, removed: (row?.removed || 0) > 0, count: row?.star_count || 0 };
}

export async function hasStarred(threadId: number, userId: number) {
  const row = await queryOne<{ exists: boolean }>(
    `select exists(
       select 1 from support_stars where thread_id = $1 and user_id = $2
     )`,
    [threadId, userId],
  );
  return row?.exists === true;
}

// --- supporter roster (support_team) ---

export async function isSupportTeamMember(userId: number) {
  const row = await queryOne<{ exists: boolean }>(
    `select exists(select 1 from support_team where user_id = $1)`,
    [userId],
  );
  return row?.exists === true;
}

export async function listSupportTeam() {
  const rows = await query<{
    user_id: string;
    username: string;
    first_name: string;
    role: SupporterRole;
    added_by_user_id: string | null;
    created_at: string;
  }>(
    `select st.user_id, u.username, u.first_name, st.role,
            st.added_by_user_id, st.created_at::text
       from support_team st
       join users u on u.id = st.user_id
      order by st.created_at desc`,
  );
  return rows.map(r => ({
    userId: Number(r.user_id),
    username: r.username,
    firstName: r.first_name,
    role: r.role,
    addedByUserId: r.added_by_user_id ? Number(r.added_by_user_id) : null,
    createdAt: r.created_at,
  })) satisfies SupportTeamMember[];
}

export async function getSupportTeamRole(userId: number) {
  const row = await queryOne<{ role: SupporterRole }>(
    `select role from support_team where user_id = $1`,
    [userId],
  );
  return row?.role ?? null;
}

// Telegram chat ids for supporters who have a linked account - used to fan
// out new-thread notifications.
export async function listSupporterTelegramChatIds() {
  const rows = await query<{ telegram_id: string }>(
    `select u.telegram_id
       from support_team st
       join users u on u.id = st.user_id
      where u.telegram_id is not null`,
  );
  return rows.map(r => r.telegram_id);
}

export async function addSupportTeamMember(input: {
  userId: number;
  addedByUserId: number;
  role?: SupporterRole;
}) {
  await query(
    `insert into support_team (user_id, added_by_user_id, role)
     values ($1, $2, $3)
     on conflict (user_id) do update set role = excluded.role`,
    [input.userId, input.addedByUserId, input.role ?? "supporter"],
  );
}

export async function removeSupportTeamMember(userId: number) {
  await query(`delete from support_team where user_id = $1`, [userId]);
}

// --- per-thread invited supporters ---

export async function addThreadSupporter(input: {
  threadId: number;
  userId: number;
  invitedByUserId: number;
}) {
  await query(
    `insert into support_thread_supporters (thread_id, user_id, invited_by_user_id)
     values ($1, $2, $3)
     on conflict (thread_id, user_id) do nothing`,
    [input.threadId, input.userId, input.invitedByUserId],
  );
}

export async function listThreadSupporters(threadId: number) {
  const rows = await query<{
    user_id: string;
    username: string;
    invited_by_user_id: string | null;
    created_at: string;
  }>(
    `select ts.user_id, u.username, ts.invited_by_user_id, ts.created_at::text
       from support_thread_supporters ts
       join users u on u.id = ts.user_id
      where ts.thread_id = $1
      order by ts.created_at asc`,
    [threadId],
  );
  return rows.map(r => ({
    userId: Number(r.user_id),
    username: r.username,
    invitedByUserId: r.invited_by_user_id ? Number(r.invited_by_user_id) : null,
    createdAt: r.created_at,
  })) satisfies SupportThreadSupporter[];
}

export async function isThreadSupporter(threadId: number, userId: number) {
  const row = await queryOne<{ exists: boolean }>(
    `select exists(
       select 1 from support_thread_supporters
        where thread_id = $1 and user_id = $2
     )`,
    [threadId, userId],
  );
  return row?.exists === true;
}

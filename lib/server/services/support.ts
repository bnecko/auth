import { authBaseUrl } from "../config";
import { publicId } from "../crypto";
import { type RequestContext } from "../http";
import { rateLimit } from "../rateLimit";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { getTelegramQueue } from "../queue";
import { escapeHtml } from "../telegramSend";
import { findUserById, findUserByIdentifier } from "../repositories/users";
import {
  addSupportTeamMember,
  addThreadSupporter,
  claimSupportThread,
  createSupportMessage,
  createSupportThread,
  deleteSupportMessage,
  deleteSupportThread,
  findSupportThreadByPublicId,
  hasStarred,
  isSupportTeamMember,
  isThreadSupporter,
  addSupportStar,
  listPublicSupportThreads,
  listSupporterTelegramChatIds,
  listSupportMessages,
  listSupportQueue,
  listSupportTeam,
  listSupportThreadsForAuthor,
  listThreadRevisions,
  listThreadSupporters,
  removeSupportStar,
  removeSupportTeamMember,
  setSupportThreadStatus,
  setSupportThreadVisibility,
  unclaimSupportThread,
  updateSupportThread,
  type SupportThread,
  type SupportThreadKind,
  type SupportThreadStatus,
  type SupportThreadVisibility,
} from "../repositories/support";
import type { User } from "../types";

const THREAD_RATE = { limit: 5, windowMs: 60 * 60 * 1000 };
const REPLY_RATE = { limit: 20, windowMs: 60 * 60 * 1000 };

const TITLE_MAX = 120;
const BODY_MAX = 4000;
const MESSAGE_MAX = 4000;

export type SupportAccess = {
  canView: boolean;
  canComment: boolean;
  canInternalNote: boolean;
  canStar: boolean;
  canClaim: boolean;
  canManage: boolean;
  canEditThread: boolean;
  canDeleteThread: boolean;
  canPublish: boolean;
};

// Single source of truth for who can do what on a thread. `viewer` may be null
// (a logged-out visitor reading a public thread). Exported for unit testing.
export function computeAccess(input: {
  thread: SupportThread;
  viewer: User | null;
  isStaff: boolean;
  isAdmin: boolean;
  isClaimer: boolean;
  isInvited: boolean;
}): SupportAccess {
  const { thread, viewer, isStaff, isAdmin, isClaimer, isInvited } = input;
  const signedIn = !!viewer;
  const isAuthor = signedIn && viewer.id === thread.authorUserId;

  // Private threads: the author always sees their own; admins see all; a
  // supporter sees it only while it is unclaimed, or if they are the claimer
  // or were invited onto it.
  const privateViewable =
    isAuthor ||
    isAdmin ||
    (isStaff && (thread.claimedByUserId === null || isClaimer || isInvited));
  const canView = thread.visibility === "public" ? true : privateViewable;

  const open = thread.status !== "closed";
  const authorOrAdmin = isAuthor || isAdmin;
  return {
    canView,
    canComment: canView && signedIn && (open || isStaff),
    canInternalNote: canView && isStaff,
    canStar: signedIn && thread.visibility === "public",
    canClaim:
      canView &&
      isStaff &&
      thread.kind === "ticket" &&
      thread.claimedByUserId === null &&
      (thread.status === "open" || thread.status === "in_progress"),
    canManage: canView && (isAdmin || (isStaff && isClaimer)),
    canEditThread: canView && authorOrAdmin,
    canDeleteThread: canView && authorOrAdmin,
    canPublish: canView && authorOrAdmin && thread.visibility === "private",
  };
}

async function resolveAccess(thread: SupportThread, viewer: User | null) {
  const isAdmin = !!viewer && viewer.role === "admin";
  const isStaff =
    isAdmin || (!!viewer && (await isSupportTeamMember(viewer.id)));
  const isClaimer =
    !!viewer && thread.claimedByUserId !== null && thread.claimedByUserId === viewer.id;
  const isInvited =
    !!viewer && isStaff ? await isThreadSupporter(thread.id, viewer.id) : false;
  return {
    isAdmin,
    isStaff,
    isClaimer,
    isInvited,
    access: computeAccess({ thread, viewer, isStaff, isAdmin, isClaimer, isInvited }),
  };
}

export async function listPublicThreads(status?: "open" | "resolved" | "closed") {
  return listPublicSupportThreads(status);
}

export async function listMyThreads(userId: number) {
  return listSupportThreadsForAuthor(userId);
}

export async function listQueue(viewer: User) {
  return listSupportQueue(viewer.role === "admin" ? null : viewer.id);
}

export async function createThread(input: {
  user: User;
  kind: SupportThreadKind;
  visibility: SupportThreadVisibility;
  title: string;
  body: string;
  context: RequestContext;
}) {
  const title = input.title.trim();
  const body = input.body.trim();

  if (input.kind !== "ticket" && input.kind !== "issue") {
    throw new Error("invalid thread kind");
  }
  if (input.visibility !== "public" && input.visibility !== "private") {
    throw new Error("invalid visibility");
  }
  if (!title || title.length > TITLE_MAX) {
    throw new Error(`title must be 1-${TITLE_MAX} characters`);
  }
  if (!body || body.length > BODY_MAX) {
    throw new Error(`description must be 1-${BODY_MAX} characters`);
  }

  const rl = await rateLimit(
    `rl:support:thread:user:${input.user.id}`,
    THREAD_RATE.limit,
    THREAD_RATE.windowMs,
  );
  if (!rl.success) {
    await recordSecurityEvent({
      userId: input.user.id,
      eventType: "support_rate_limited",
      result: "thread",
      context: input.context,
    });
    throw new Error("you are creating threads too quickly - try again later");
  }

  const thread = await createSupportThread({
    publicId: publicId("sup"),
    kind: input.kind,
    visibility: input.visibility,
    authorUserId: input.user.id,
    title,
    body,
  });

  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_thread_created",
    result: "ok",
    context: input.context,
    metadata: { threadId: thread.publicId, kind: thread.kind, visibility: thread.visibility },
  });

  // Best-effort fan-out to supporters; never block thread creation on it.
  try {
    await notifySupporters({ thread, author: input.user });
  } catch (err) {
    await recordSecurityEvent({
      userId: input.user.id,
      eventType: "support_notify_failed",
      result: err instanceof Error ? err.message : "unknown",
      context: input.context,
      metadata: { threadId: thread.publicId },
    });
  }

  return thread;
}

async function notifySupporters(input: { thread: SupportThread; author: User }) {
  const chatIds = await listSupporterTelegramChatIds();
  if (chatIds.length === 0) {
    return;
  }

  const authorLine = input.author.telegramUsername
    ? `${input.author.firstName} (@${input.author.telegramUsername})`
    : input.author.firstName;

  const text = [
    `<b>New support ${input.thread.kind}</b>`,
    "",
    `<b>From:</b> ${escapeHtml(authorLine)}`,
    `<b>Visibility:</b> ${input.thread.visibility}`,
    "",
    `<b>${escapeHtml(input.thread.title)}</b>`,
    "",
    `<a href="${authBaseUrl()}/support/${input.thread.publicId}">open thread</a>`,
  ].join("\n");

  const queue = getTelegramQueue();
  for (const chatId of chatIds) {
    await queue.add("send", { chat_id: chatId, text });
  }
}

// Full view for the thread page. Returns null when the thread does not exist
// or the viewer may not see it (the page renders both as 404, so we never
// confirm the existence of a private thread to an unauthorized viewer).
export async function getThreadView(input: {
  threadPublicId: string;
  viewer: User | null;
}) {
  const thread = await findSupportThreadByPublicId(input.threadPublicId);
  if (!thread) {
    return null;
  }

  const { isAdmin, isStaff, access } = await resolveAccess(thread, input.viewer);
  if (!access.canView) {
    return null;
  }

  const [rawMessages, supporters, starred, revisions] = await Promise.all([
    listSupportMessages({ threadId: thread.id, includeInternal: access.canInternalNote }),
    isStaff ? listThreadSupporters(thread.id) : Promise.resolve([]),
    input.viewer && thread.visibility === "public"
      ? hasStarred(thread.id, input.viewer.id)
      : Promise.resolve(false),
    // The edit history is public to anyone who can view the thread.
    listThreadRevisions(thread.id),
  ]);

  // A message can be deleted by its author or an admin.
  const viewerId = input.viewer?.id ?? null;
  const messages = rawMessages.map(m => ({
    ...m,
    canDelete: isAdmin || (viewerId !== null && m.authorUserId === viewerId),
  }));

  return { thread, access, messages, supporters, starred, revisions, isStaff };
}

async function loadForAction(threadPublicId: string, viewer: User) {
  const thread = await findSupportThreadByPublicId(threadPublicId);
  if (!thread) {
    throw new Error("thread not found");
  }
  const resolved = await resolveAccess(thread, viewer);
  return { thread, ...resolved };
}

export async function postReply(input: {
  threadPublicId: string;
  user: User;
  body: string;
  internal: boolean;
  context: RequestContext;
}) {
  const body = input.body.trim();
  if (!body || body.length > MESSAGE_MAX) {
    throw new Error(`message must be 1-${MESSAGE_MAX} characters`);
  }

  const { thread, access } = await loadForAction(input.threadPublicId, input.user);
  const internal = input.internal && access.canInternalNote;
  if (internal ? !access.canInternalNote : !access.canComment) {
    throw new Error("forbidden");
  }

  const rl = await rateLimit(
    `rl:support:reply:user:${input.user.id}`,
    REPLY_RATE.limit,
    REPLY_RATE.windowMs,
  );
  if (!rl.success) {
    await recordSecurityEvent({
      userId: input.user.id,
      eventType: "support_rate_limited",
      result: "reply",
      context: input.context,
    });
    throw new Error("you are replying too quickly - try again later");
  }

  await createSupportMessage({
    publicId: publicId("smg"),
    threadId: thread.id,
    authorUserId: input.user.id,
    body,
    internal,
  });

  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_message_posted",
    result: internal ? "internal" : "ok",
    context: input.context,
    metadata: { threadId: thread.publicId },
  });
}

export async function editThread(input: {
  threadPublicId: string;
  user: User;
  title: string;
  body: string;
  context: RequestContext;
}) {
  const { thread, access } = await loadForAction(input.threadPublicId, input.user);
  if (!access.canEditThread) {
    throw new Error("forbidden");
  }
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || title.length > TITLE_MAX) {
    throw new Error(`title must be 1-${TITLE_MAX} characters`);
  }
  if (!body || body.length > BODY_MAX) {
    throw new Error(`description must be 1-${BODY_MAX} characters`);
  }
  // No-op edits should not create empty history entries.
  if (title === thread.title && body === thread.body) {
    return thread;
  }
  const updated = await updateSupportThread({
    publicId: thread.publicId,
    revisionPublicId: publicId("srev"),
    editedByUserId: input.user.id,
    title,
    body,
  });
  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_thread_edited",
    result: "ok",
    context: input.context,
    metadata: { threadId: thread.publicId },
  });
  return updated;
}

export async function deleteThread(input: {
  threadPublicId: string;
  user: User;
  context: RequestContext;
}) {
  const { thread, access } = await loadForAction(input.threadPublicId, input.user);
  if (!access.canDeleteThread) {
    throw new Error("forbidden");
  }
  await deleteSupportThread(thread.publicId);
  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_thread_deleted",
    result: "ok",
    context: input.context,
    metadata: { threadId: thread.publicId },
  });
}

export async function deleteMessage(input: {
  threadPublicId: string;
  messagePublicId: string;
  user: User;
  context: RequestContext;
}) {
  const { thread, isAdmin } = await loadForAction(input.threadPublicId, input.user);
  // Find the message to check authorship (admins may delete any).
  const messages = await listSupportMessages({ threadId: thread.id, includeInternal: true });
  const message = messages.find(m => m.publicId === input.messagePublicId);
  if (!message) {
    throw new Error("message not found");
  }
  if (!isAdmin && message.authorUserId !== input.user.id) {
    throw new Error("forbidden");
  }
  await deleteSupportMessage(input.messagePublicId);
  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_message_deleted",
    result: "ok",
    context: input.context,
    metadata: { threadId: thread.publicId, messageId: input.messagePublicId },
  });
}

export async function publishThread(input: {
  threadPublicId: string;
  user: User;
  context: RequestContext;
}) {
  const { thread, access } = await loadForAction(input.threadPublicId, input.user);
  if (!access.canPublish) {
    throw new Error("forbidden");
  }
  await setSupportThreadVisibility({ publicId: thread.publicId, visibility: "public" });
  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_thread_published",
    result: "ok",
    context: input.context,
    metadata: { threadId: thread.publicId },
  });
}

export async function toggleStar(input: { threadPublicId: string; user: User }) {
  const { thread, access } = await loadForAction(input.threadPublicId, input.user);
  if (!access.canStar) {
    throw new Error("forbidden");
  }
  const already = await hasStarred(thread.id, input.user.id);
  return already
    ? removeSupportStar(thread.id, input.user.id)
    : addSupportStar(thread.id, input.user.id);
}

export async function claimThread(input: {
  threadPublicId: string;
  user: User;
  context: RequestContext;
}) {
  const { thread, access } = await loadForAction(input.threadPublicId, input.user);
  if (!access.canClaim) {
    throw new Error("forbidden");
  }
  const claimed = await claimSupportThread({
    publicId: thread.publicId,
    supporterUserId: input.user.id,
  });
  if (!claimed) {
    throw new Error("this ticket was already claimed");
  }
  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_thread_claimed",
    result: "ok",
    context: input.context,
    metadata: { threadId: thread.publicId },
  });
  return claimed;
}

export async function unclaimThread(input: {
  threadPublicId: string;
  user: User;
  context: RequestContext;
}) {
  const { thread, access } = await loadForAction(input.threadPublicId, input.user);
  if (!access.canManage) {
    throw new Error("forbidden");
  }
  await unclaimSupportThread(thread.publicId);
  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_thread_unclaimed",
    result: "ok",
    context: input.context,
    metadata: { threadId: thread.publicId },
  });
}

export async function setStatus(input: {
  threadPublicId: string;
  user: User;
  status: SupportThreadStatus;
  context: RequestContext;
}) {
  const valid: SupportThreadStatus[] = ["open", "in_progress", "resolved", "closed"];
  if (!valid.includes(input.status)) {
    throw new Error("invalid status");
  }
  const { thread, access } = await loadForAction(input.threadPublicId, input.user);
  if (!access.canManage) {
    throw new Error("forbidden");
  }
  await setSupportThreadStatus({ publicId: thread.publicId, status: input.status });
  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_thread_status",
    result: input.status,
    context: input.context,
    metadata: { threadId: thread.publicId },
  });
}

export async function inviteSupporter(input: {
  threadPublicId: string;
  user: User;
  inviteeUsername: string;
  context: RequestContext;
}) {
  const { thread, access } = await loadForAction(input.threadPublicId, input.user);
  if (!access.canManage) {
    throw new Error("forbidden");
  }

  const invitee = await findUserByIdentifier(input.inviteeUsername.trim());
  if (!invitee) {
    throw new Error("no user with that username");
  }
  if (!(await isSupportTeamMember(invitee.id)) && invitee.role !== "admin") {
    throw new Error("that user is not a supporter");
  }

  await addThreadSupporter({
    threadId: thread.id,
    userId: invitee.id,
    invitedByUserId: input.user.id,
  });

  await recordSecurityEvent({
    userId: input.user.id,
    eventType: "support_supporter_invited",
    result: "ok",
    context: input.context,
    metadata: { threadId: thread.publicId, invitee: invitee.id },
  });
}

// --- admin roster management ---

export async function listSupporters() {
  return listSupportTeam();
}

function adminContext(): RequestContext {
  return { ip: "", userAgent: "admin_ui", country: "" };
}

export async function addSupporter(input: { admin: User; username: string }) {
  const target = await findUserByIdentifier(input.username.trim());
  if (!target) {
    throw new Error("no user with that username");
  }
  await addSupportTeamMember({ userId: target.id, addedByUserId: input.admin.id });
  await recordSecurityEvent({
    userId: input.admin.id,
    eventType: "support_supporter_added",
    result: "ok",
    context: adminContext(),
    metadata: { supporter: target.id, username: target.username },
  });
}

export async function removeSupporter(input: { admin: User; userId: number }) {
  const target = await findUserById(input.userId);
  await removeSupportTeamMember(input.userId);
  await recordSecurityEvent({
    userId: input.admin.id,
    eventType: "support_supporter_removed",
    result: "ok",
    context: adminContext(),
    metadata: { supporter: input.userId, username: target?.username || null },
  });
}

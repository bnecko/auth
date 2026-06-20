"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentSession } from "@/lib/server/session";
import { requestContextFromHeaders } from "@/lib/server/http";
import {
  claimThread,
  createThread,
  deleteMessage,
  deleteThread,
  editThread,
  inviteSupporter,
  postReply,
  publishThread,
  setStatus,
  toggleStar,
  unclaimThread,
} from "@/lib/server/services/support";
import type {
  SupportThreadKind,
  SupportThreadStatus,
  SupportThreadVisibility,
} from "@/lib/server/repositories/support";

async function ctx() {
  return requestContextFromHeaders(await headers());
}

function threadPath(id: string) {
  return `/support/${id}`;
}

// Used with useActionState on the new-thread form, so it returns an error
// string on validation failure and redirects to the created thread on success.
export async function createThreadAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const current = await getCurrentSession();
  if (!current) redirect("/login?next=/support/new");

  const kind = String(formData.get("kind") || "issue") as SupportThreadKind;
  const visibility = String(
    formData.get("visibility") || "public",
  ) as SupportThreadVisibility;
  const title = String(formData.get("title") || "");
  const body = String(formData.get("body") || "");

  let thread;
  try {
    thread = await createThread({
      user: current.user,
      kind,
      visibility,
      title,
      body,
      context: await ctx(),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not create thread" };
  }

  redirect(`/support/${thread.publicId}`);
}

export async function editThreadAction(
  _prev: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const id = String(formData.get("threadId") || "");
  const current = await getCurrentSession();
  if (!current) redirect(`/login?next=${encodeURIComponent(threadPath(id))}`);
  try {
    await editThread({
      threadPublicId: id,
      user: current.user,
      title: String(formData.get("title") || ""),
      body: String(formData.get("body") || ""),
      context: await ctx(),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not save changes" };
  }
  revalidatePath(threadPath(id));
  return { ok: true };
}

export async function deleteThreadAction(formData: FormData) {
  const id = String(formData.get("threadId") || "");
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  await deleteThread({ threadPublicId: id, user: current.user, context: await ctx() });
  redirect("/support/mine");
}

export async function deleteMessageAction(formData: FormData) {
  const id = String(formData.get("threadId") || "");
  const messageId = String(formData.get("messageId") || "");
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  await deleteMessage({
    threadPublicId: id,
    messagePublicId: messageId,
    user: current.user,
    context: await ctx(),
  });
  revalidatePath(threadPath(id));
}

export async function publishThreadAction(formData: FormData) {
  const id = String(formData.get("threadId") || "");
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  await publishThread({ threadPublicId: id, user: current.user, context: await ctx() });
  revalidatePath(threadPath(id));
}

export async function starAction(formData: FormData) {
  const id = String(formData.get("threadId") || "");
  const current = await getCurrentSession();
  if (!current) redirect(`/login?next=${encodeURIComponent(threadPath(id))}`);
  await toggleStar({ threadPublicId: id, user: current.user });
  revalidatePath(threadPath(id));
  revalidatePath("/support");
}

export async function replyAction(formData: FormData) {
  const id = String(formData.get("threadId") || "");
  const body = String(formData.get("body") || "");
  const internal = formData.get("internal") === "on";
  const current = await getCurrentSession();
  if (!current) redirect(`/login?next=${encodeURIComponent(threadPath(id))}`);
  await postReply({
    threadPublicId: id,
    user: current.user,
    body,
    internal,
    context: await ctx(),
  });
  revalidatePath(threadPath(id));
}

export async function claimAction(formData: FormData) {
  const id = String(formData.get("threadId") || "");
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  await claimThread({ threadPublicId: id, user: current.user, context: await ctx() });
  revalidatePath(threadPath(id));
}

export async function unclaimAction(formData: FormData) {
  const id = String(formData.get("threadId") || "");
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  await unclaimThread({ threadPublicId: id, user: current.user, context: await ctx() });
  revalidatePath(threadPath(id));
}

export async function statusAction(formData: FormData) {
  const id = String(formData.get("threadId") || "");
  const status = String(formData.get("status") || "") as SupportThreadStatus;
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  await setStatus({
    threadPublicId: id,
    user: current.user,
    status,
    context: await ctx(),
  });
  revalidatePath(threadPath(id));
}

export async function inviteAction(formData: FormData) {
  const id = String(formData.get("threadId") || "");
  const username = String(formData.get("username") || "");
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  await inviteSupporter({
    threadPublicId: id,
    user: current.user,
    inviteeUsername: username,
    context: await ctx(),
  });
  revalidatePath(threadPath(id));
}

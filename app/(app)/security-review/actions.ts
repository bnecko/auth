"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentSession } from "@/lib/server/session";
import { requestContextFromHeaders } from "@/lib/server/http";
import { canHandleSecurity, canRestrict } from "@/lib/server/supporterAuth";
import { findUserByIdentifier } from "@/lib/server/repositories/users";
import { setSuspicionStatus } from "@/lib/server/repositories/suspicion";
import {
  getRestrictionForReview,
  postSecurityReply,
  restrictUser,
  unrestrictUser,
} from "@/lib/server/services/restrictions";

async function ctx() {
  return requestContextFromHeaders(await headers());
}

export async function dismissSuspicionAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || !(await canHandleSecurity(current.user))) redirect("/");
  const id = String(formData.get("suspicionId") || "");
  await setSuspicionStatus({
    publicId: id,
    status: "dismissed",
    reviewedByUserId: current.user.id,
  });
  revalidatePath("/security-review");
}

export async function restrictFromQueueAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || !(await canRestrict(current.user))) redirect("/");
  const suspicionId = String(formData.get("suspicionId") || "");
  const userId = Number(formData.get("userId") || 0);
  const triggerType = String(formData.get("triggerType") || "manual");
  const reason = String(formData.get("reason") || "").trim() || null;
  if (userId) {
    await restrictUser({
      targetUserId: userId,
      triggerType,
      reason,
      actor: current.user,
      suspicionEventPublicId: suspicionId,
      context: await ctx(),
    });
  }
  revalidatePath("/security-review");
}

export async function restrictManualAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || !(await canRestrict(current.user))) redirect("/");
  const username = String(formData.get("username") || "").trim();
  const reason = String(formData.get("reason") || "").trim() || null;
  const target = await findUserByIdentifier(username);
  if (!target) throw new Error("no user with that username");
  await restrictUser({
    targetUserId: target.id,
    triggerType: "manual",
    reason,
    actor: current.user,
    context: await ctx(),
  });
  revalidatePath("/security-review");
}

export async function liftRestrictionAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || !(await canRestrict(current.user))) redirect("/");
  const id = String(formData.get("restrictionId") || "");
  await unrestrictUser({ restrictionPublicId: id, actor: current.user, context: await ctx() });
  redirect("/security-review");
}

export async function securityReplyAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || !(await canHandleSecurity(current.user))) redirect("/");
  const restrictionId = String(formData.get("restrictionId") || "");
  const body = String(formData.get("body") || "");
  const internal = formData.get("internal") === "on";
  const view = await getRestrictionForReview(restrictionId);
  if (!view || !view.thread) throw new Error("restriction not found");
  await postSecurityReply({
    actor: current.user,
    threadId: view.thread.id,
    body,
    internal,
    context: await ctx(),
  });
  revalidatePath(`/security-review/${restrictionId}`);
}

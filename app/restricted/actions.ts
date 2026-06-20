"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sessionCookieName } from "@/lib/server/config";
import { getCurrentSession } from "@/lib/server/session";
import { requestContextFromHeaders } from "@/lib/server/http";
import { postRestrictedReply } from "@/lib/server/services/restrictions";

export async function restrictedReplyAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const body = String(formData.get("body") || "");
  await postRestrictedReply({
    user: current.user,
    body,
    context: requestContextFromHeaders(await headers()),
  });
  revalidatePath("/restricted");
}

export async function signOutAction() {
  const store = await cookies();
  store.delete(sessionCookieName);
  redirect("/login");
}

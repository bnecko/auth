"use server";

import { redirect } from "next/navigation";
import { upsertAuthorization } from "@/lib/server/repositories/authorizations";
import { findDeviceCodeByUserCode, updateDeviceCodeStatus } from "@/lib/server/repositories/oauth";
import { assertNotRestricted, getCurrentSession } from "@/lib/server/session";

// These were closures inside the page, acting as whoever the page had resolved
// when it rendered. Next sends a closure's captured values to the browser and
// takes them back on submit, so the bound session outlived sign-out, a password
// change and a restriction: a replayed submit still approved as that user. Each
// action now establishes who is asking at the moment it runs.
async function currentUserId() {
  const current = await getCurrentSession();
  if (!current) redirect(`/login?next=${encodeURIComponent("/device")}`);
  assertNotRestricted(current);
  return current.user.id;
}

const userCodeFrom = (formData: FormData) => formData.get("user_code")?.toString().toUpperCase().trim() || "";

export async function submitCodeAction(formData: FormData) {
  await currentUserId();
  const code = userCodeFrom(formData);
  if (code) redirect(`/device?user_code=${encodeURIComponent(code)}`);
}

export async function approveCodeAction(formData: FormData) {
  const userId = await currentUserId();
  const code = userCodeFrom(formData);
  if (!code) return;

  // Read first: the row is what says which app and which scopes are being
  // approved, and neither comes from the form.
  const deviceCode = await findDeviceCodeByUserCode(code);
  const approved = deviceCode ? await updateDeviceCodeStatus(code, "approved", userId) : false;
  if (!deviceCode || !approved) redirect(`/device?user_code=${encodeURIComponent(code)}`);

  // Without this the grant exists only as tokens: it never shows under
  // connected apps, so the user has nothing to revoke.
  await upsertAuthorization({ userId, appId: deviceCode.appId, scopes: deviceCode.scopes });
  redirect("/device?success=true");
}

export async function denyCodeAction(formData: FormData) {
  const userId = await currentUserId();
  const code = userCodeFrom(formData);
  if (!code) return;
  await updateDeviceCodeStatus(code, "denied", userId);
  redirect("/device");
}

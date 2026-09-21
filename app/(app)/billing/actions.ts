"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authBaseUrl } from "@/lib/server/config";
import { requestContextFromHeaders } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { startKycSession } from "@/lib/server/repositories/kyc";
import { createVerificationSession, isDiditConfigured } from "@/lib/server/kyc/didit";
import { assertNotRestricted, getCurrentSession } from "@/lib/server/session";

export type VerifyState = { error?: string } | null;

export async function startVerificationAction(): Promise<VerifyState> {
  const current = await getCurrentSession();
  if (!current) return { error: "not signed in" };
  assertNotRestricted(current);

  if (!isDiditConfigured()) return { error: "identity verification is not available yet" };

  let url: string;
  try {
    const session = await createVerificationSession({
      userId: current.user.id,
      // Where the provider returns the user afterwards. The result itself
      // arrives by webhook, so this only decides where they land.
      callbackUrl: `${authBaseUrl().replace(/\/+$/, "")}/billing`,
    });
    await startKycSession(current.user.id, session.sessionId);
    await recordSecurityEvent({
      userId: current.user.id,
      eventType: "kyc_session_started",
      result: "ok",
      context: requestContextFromHeaders(await headers()),
    });
    url = session.url;
  } catch (err) {
    log.error("kyc_session_start_failed", { userId: current.user.id, error: err });
    return { error: "could not start verification just now, try again" };
  }

  // Outside the try: redirect() signals by throwing, and catching it here
  // would turn a working redirect into the error message above.
  redirect(url);
}

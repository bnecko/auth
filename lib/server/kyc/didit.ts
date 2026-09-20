import { diditApiKey, diditWorkflowId } from "../config";

const SESSION_URL = "https://verification.didit.me/v3/session/";
const REQUEST_TIMEOUT_MS = 10_000;

export type DiditSession = { sessionId: string; url: string };

/**
 * Opens a verification session and returns the hosted URL to send the user to.
 *
 * `vendor_data` carries our user id and is the only thing tying the eventual
 * webhook back to an account, so it is set from the session the caller already
 * authenticated rather than from anything the browser supplied.
 *
 * A fixed, trusted host, so this uses a plain fetch with its own timeout in the
 * manner of the Resend client, rather than safeFetch's SSRF guard.
 */
export async function createVerificationSession(input: {
  userId: number;
  callbackUrl: string;
}): Promise<DiditSession> {
  const apiKey = diditApiKey();
  const workflowId = diditWorkflowId();
  if (!apiKey || !workflowId) throw new Error("didit is not configured");

  const res = await fetch(SESSION_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      workflow_id: workflowId,
      vendor_data: String(input.userId),
      callback: input.callbackUrl,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`didit session creation responded ${res.status}`);

  const body = (await res.json()) as { session_id?: unknown; url?: unknown };
  if (typeof body.session_id !== "string" || typeof body.url !== "string") {
    throw new Error("didit session response was missing session_id or url");
  }

  // Their hosted flow only. A url from anywhere else would mean sending a user
  // off to a page of someone else's choosing with our branding on it.
  let host: string;
  try {
    host = new URL(body.url).host;
  } catch {
    throw new Error("didit session url is not a url");
  }
  if (host !== "verify.didit.me" && !host.endsWith(".didit.me")) {
    throw new Error(`didit session url points at an unexpected host: ${host}`);
  }

  return { sessionId: body.session_id, url: body.url };
}

export function isDiditConfigured(): boolean {
  return Boolean(diditApiKey() && diditWorkflowId());
}

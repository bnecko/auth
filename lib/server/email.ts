import { emailFromAddress, isProduction, resendApiKey } from "./config";

// Minimal client for sending transactional email via the Resend REST API.
// Mirrors telegramSend.ts: direct fetch to a fixed external host, dev-noop
// when unconfigured, throw on failure so the caller can surface it. The host
// is a constant (not user-controlled), so the SSRF guard in safeFetch.ts is
// not needed here.

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(input: SendEmailInput) {
  const key = resendApiKey();
  if (!key) {
    // Outside production we silently no-op so local dev without a Resend key
    // doesn't fail every flow that sends a code.
    if (isProduction()) {
      throw new Error("RESEND_API_KEY is required");
    }
    return { ok: false, skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: emailFromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`resend send failed: ${response.status} ${text}`);
  }

  return { ok: true };
}

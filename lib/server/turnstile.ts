import { env, isProduction } from "./config";

export async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret) {
    // Fail-open is only acceptable in local development. A misconfigured
    // production deploy missing TURNSTILE_SECRET_KEY would otherwise ship
    // with no bot protection and no warning.
    if (isProduction()) {
      throw new Error("turnstile is not configured");
    }
    return true;
  }

  if (!token) {
    return false;
  }

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) {
    form.set("remoteip", ip);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: form,
    },
  );

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}

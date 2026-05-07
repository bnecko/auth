import { env } from "./config";

export async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret) {
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

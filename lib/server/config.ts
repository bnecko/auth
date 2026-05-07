export const sessionCookieName = "bn_session";
export const pendingActivationCookieName = "bn_pending_activation";

export function env(name: string) {
  return process.env[name] || "";
}

export function requireEnv(name: string) {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function authBaseUrl() {
  return env("AUTH_BASE_URL") || "http://localhost:3000";
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function sessionMaxAgeSeconds() {
  return Number(env("SESSION_MAX_AGE_SECONDS") || 60 * 60 * 24 * 30);
}

export function registrationTtlMinutes() {
  return Number(env("REGISTRATION_TTL_MINUTES") || 15);
}

export function activationTtlMinutes() {
  return Number(env("ACTIVATION_TTL_MINUTES") || 10);
}

// Telegram user id that receives bearer-key approval messages and whose
// inline button presses can approve or reject them. Defaults to the
// project owner; override with BEARER_ADMIN_TELEGRAM_ID per deploy.
export function bearerAdminTelegramId() {
  return env("BEARER_ADMIN_TELEGRAM_ID") || "BEARER_ADMIN_TG_ID";
}

export const sessionCookieName = "bn_session";
export const pendingActivationCookieName = "bn_pending_activation";
export const loginChallengeCookieName = "bn_login_challenge";

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

export function sessionShortAgeSeconds() {
  return Number(env("SESSION_SHORT_AGE_SECONDS") || 60 * 60 * 12);
}

export function login2faTtlMinutes() {
  return Number(env("LOGIN_2FA_TTL_MINUTES") || 5);
}

export function registrationTtlMinutes() {
  return Number(env("REGISTRATION_TTL_MINUTES") || 15);
}

export function activationTtlMinutes() {
  return Number(env("ACTIVATION_TTL_MINUTES") || 10);
}

export function oidcPrivateKeyPem() {
  const raw = requireEnv("OIDC_PRIVATE_KEY_PEM");
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function oidcKeyId() {
  return env("OIDC_KEY_ID") || "default";
}

type OidcSigningKey = {
  kid: string;
  privateKeyPem: string;
  status: "active" | "retired" | "revoked";
};

function normalizePem(value: string) {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function oidcSigningKeys(): OidcSigningKey[] {
  const raw = env("OIDC_SIGNING_KEYS_JSON");
  if (!raw) {
    return [
      {
        kid: oidcKeyId(),
        privateKeyPem: oidcPrivateKeyPem(),
        status: "active",
      },
    ];
  }

  const parsed = JSON.parse(raw) as Array<{
    kid?: unknown;
    privateKeyPem?: unknown;
    private_key_pem?: unknown;
    status?: unknown;
  }>;

  return parsed.map(item => {
    const privateKey = item.privateKeyPem || item.private_key_pem;
    if (typeof item.kid !== "string" || typeof privateKey !== "string") {
      throw new Error("OIDC_SIGNING_KEYS_JSON entries require kid and privateKeyPem");
    }

    const status = item.status === "retired" || item.status === "revoked"
      ? item.status
      : "active";

    return {
      kid: item.kid,
      privateKeyPem: normalizePem(privateKey),
      status,
    };
  });
}

export function activeOidcSigningKey() {
  const key = oidcSigningKeys().find(item => item.status === "active");
  if (!key) {
    throw new Error("OIDC_SIGNING_KEYS_JSON must contain an active key");
  }
  return key;
}

export function oauthDynamicRegistrationToken() {
  return env("OAUTH_DYNAMIC_REGISTRATION_TOKEN");
}

export function oauthAccessTokenTtlSeconds() {
  return Number(env("OAUTH_ACCESS_TOKEN_TTL_SECONDS") || 15 * 60);
}

export const currentOAuthProfileVersion = "bn-oauth-2026-05";
export const legacyOAuthProfileVersion = "bn-oauth-2026-01";

export const oauthProfileVersions = [
  {
    version: currentOAuthProfileVersion,
    label: "Bottleneck OAuth 2026.05",
    status: "current",
  },
  {
    version: legacyOAuthProfileVersion,
    label: "Bottleneck OAuth 2026.01",
    status: "legacy",
  },
] as const;

export function supportedOAuthProfileVersion(version: string) {
  return oauthProfileVersions.some(item => item.version === version);
}

export function bearerAdminTelegramId() {
  return env("BEARER_ADMIN_TELEGRAM_ID");
}

export function telegramBotUsername() {
  return env("TELEGRAM_BOT_USERNAME");
}

export const adminStepUpTtlSeconds = 600;

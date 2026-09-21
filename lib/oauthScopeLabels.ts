// What each scope means in words a person approving it can weigh. Shared by
// every screen that asks for consent: a scope shown as its raw identifier on
// one of them is a scope approved without being understood.
export const scopeLabels: Record<string, { label: string; sensitive?: boolean }> = {
  openid: { label: "account identifier" },
  profile: { label: "profile" },
  email: { label: "email address", sensitive: true },
  birthdate: { label: "date of birth", sensitive: true },
  "profile:read": { label: "public profile" },
  "email:read": { label: "email address", sensitive: true },
  "dob:read": { label: "date of birth", sensitive: true },
  "subscription:read": { label: "subscription status" },
  telegram: { label: "Telegram account", sensitive: true },
  "telegram:read": { label: "Telegram account", sensitive: true },
  "ton:read": { label: "TON wallet address", sensitive: true },
  "billing:charge": { label: "charge your btGRAM balance", sensitive: true },
};

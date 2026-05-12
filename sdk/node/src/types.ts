export type ActivationStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "cancelled";

export type ActivationScope =
  | "profile:read"
  | "email:read"
  | "dob:read"
  | "subscription:read";

export type OAuthProfileVersion = "bn-oauth-2026-05" | "bn-oauth-2026-01";

export type CreateActivationRequestInput = {
  apiKey: string;
  requestedSubject?: string;
  scopes?: ActivationScope[];
  returnUrl?: string;
  callbackUrl?: string;
};

export type ActivationRequestResponse = {
  id: string;
  token: string;
  activationUrl: string;
  expiresAt: string;
};

export type ActivationProfile = {
  id: string;
  firstName: string;
  username: string;
  bio: string | null;
  email: string | null;
  dob: string | null;
};

export type ActivationStatusResponse = {
  id: string;
  status: ActivationStatus;
  approvedUserId: number | null;
  expiresAt: string;
  profile: ActivationProfile | null;
};

export type CancelActivationResponse = {
  status: ActivationStatus;
};

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  refresh_token?: string;
  id_token?: string;
  oauth_profile_version?: OAuthProfileVersion;
};

export type UserInfoResponse = {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  birthdate?: string;
  [claim: string]: unknown;
};

export type IntrospectResponse = {
  active: boolean;
  scope?: string;
  client_id?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  [claim: string]: unknown;
};

export type PkcePair = {
  codeVerifier: string;
  codeChallenge: string;
  method: "S256";
};

export type AuthorizationUrlInput = {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  nonce?: string;
};

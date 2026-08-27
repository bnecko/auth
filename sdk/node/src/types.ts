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

// How client credentials are presented to the token, introspection, and
// revocation endpoints. Must match the app's registered
// token_endpoint_auth_method: the server rejects a mismatch with
// invalid_client.
export type TokenEndpointAuthMethod =
  | "client_secret_post"
  | "client_secret_basic"
  | "none";

// Per-request overrides. `signal` aborts the request with the caller's own
// abort reason; `timeoutMs` overrides the client-level timeout (0 disables).
export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type CreateActivationRequestInput = {
  apiKey: string;
  requestedSubject?: string;
  scopes?: ActivationScope[];
  returnUrl?: string;
  callbackUrl?: string;
  // Sent as the Idempotency-Key header (8-255 chars). A retried create with
  // the same key returns the original response instead of minting a
  // duplicate request.
  idempotencyKey?: string;
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
  // True once the standing grant behind an approved activation has been
  // revoked. The status stays "approved" but profile becomes null, so check
  // this before treating an old approval as live.
  revoked: boolean;
  deniedReason: string | null;
  expiresAt: string;
  profile: ActivationProfile | null;
};

export type CancelActivationResponse = {
  status: ActivationStatus;
};

export type RevokeActivationResponse = {
  id: string;
  revoked: boolean;
};

export type AppConfigResponse = {
  id: string;
  name: string;
  slug: string;
  status: string;
  callbackUrl: string | null;
  allowedRedirectUrls: string[];
  allowedScopes: string[];
  requiredProduct: string | null;
};

export type ActivationRequestSummary = {
  id: string;
  status: ActivationStatus;
  requestedSubject: string | null;
  approvedUserId: number | null;
  deniedReason: string | null;
  createdAt: string;
  expiresAt: string;
};

export type ListActivationRequestsResponse = {
  requests: ActivationRequestSummary[];
};

export type AuthorizationSummary = {
  subject: string;
  scopes: string[];
  createdAt: string;
};

export type ListAuthorizationsResponse = {
  authorizations: AuthorizationSummary[];
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

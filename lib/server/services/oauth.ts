import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
} from "crypto";
import type { NextRequest } from "next/server";
import {
  activeOidcSigningKey,
  authBaseUrl,
  currentOAuthProfileVersion,
  legacyOAuthProfileVersion,
  oauthAccessTokenTtlSeconds,
  oauthDynamicRegistrationToken,
  oidcSigningKeys,
} from "../config";
import { randomToken, safeEqual } from "../crypto";
import { requestContext } from "../http";
import { findAuthorization, upsertAuthorization } from "../repositories/authorizations";
import {
  findExternalAppByClientId,
  verifyExternalAppClientSecret,
  findExternalAppById,
} from "../repositories/externalApps";
import {
  createAccessToken,
  createAuthorizationCode,
  createRefreshToken,
  findAccessToken,
  findAuthorizationCode,
  markAuthorizationCodeConsumed,
  revokeAccessToken,
  revokeRefreshToken,
  revokeAccessTokensForRefreshGrant,
  rotateRefreshToken,
  findPushedRequest,
  findRotatedRefreshTokenContext,
  revokeAllTokensForUserAndApp,
  markDeviceCodePolled,
  consumeDeviceCode,
} from "../repositories/oauth";
import { recordSecurityEvent } from "../repositories/securityEvents";
import {
  hasActiveSubscription,
  listSubscriptionsForUser,
} from "../repositories/subscriptions";
import { findUserById } from "../repositories/users";
import type { ExternalApp, User } from "../types";

const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export type OAuthAuthorizeView = {
  app: ExternalApp;
  clientId: string;
  redirectUri: string;
  scope: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
  nonce: string;
  existingScopes: string[];
  requiredProduct: string | null;
  subscriptionOk: boolean;
};

type AuthorizeParams = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  nonce: string;
};

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function stringParam(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function paramsFromSearch(searchParams: Record<string, string | string[] | undefined>) {
  const first = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] || "" : value || "";
  };

  return readAuthorizeParams({
    response_type: first("response_type"),
    client_id: first("client_id"),
    redirect_uri: first("redirect_uri"),
    scope: first("scope"),
    state: first("state"),
    code_challenge: first("code_challenge"),
    code_challenge_method: first("code_challenge_method"),
    nonce: first("nonce"),
  });
}

function paramsFromBody(body: Record<string, unknown>) {
  return readAuthorizeParams({
    response_type: body.response_type,
    client_id: body.client_id,
    redirect_uri: body.redirect_uri,
    scope: body.scope,
    state: body.state,
    code_challenge: body.code_challenge,
    code_challenge_method: body.code_challenge_method,
    nonce: body.nonce,
  });
}

function readAuthorizeParams(source: Record<string, unknown>): AuthorizeParams {
  return {
    responseType: stringParam(source.response_type as string),
    clientId: stringParam(source.client_id as string),
    redirectUri: stringParam(source.redirect_uri as string),
    scope: stringParam(source.scope as string),
    state: stringParam(source.state as string),
    codeChallenge: stringParam(source.code_challenge as string),
    codeChallengeMethod: stringParam(source.code_challenge_method as string),
    nonce: stringParam(source.nonce as string),
  };
}

function normalizeRedirectUri(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthError("invalid_request", "redirect_uri is invalid");
  }

  if (url.hash) {
    throw new OAuthError("invalid_request", "redirect_uri cannot contain a fragment");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new OAuthError("invalid_request", "redirect_uri protocol is unsupported");
  }

  return url.href;
}

function redirectUriAllowed(redirectUri: string, allowed: readonly string[]) {
  return allowed.some(entry => {
    try {
      const url = new URL(entry);
      url.hash = "";
      return url.href === redirectUri;
    } catch {
      return false;
    }
  });
}

const OAUTH_SCOPES = new Set([
  "openid",
  "profile",
  "email",
  "birthdate",
  "profile:read",
  "email:read",
  "dob:read",
  "subscription:read",
]);

export function parseOAuthScopes(scope: string) {
  if (!scope) {
    return ["profile:read"];
  }

  const scopes = scope.split(/\s+/).filter(Boolean);
  const unknown = scopes.find(item => !OAUTH_SCOPES.has(item));
  if (unknown) {
    throw new OAuthError("invalid_scope", `unknown scope: ${unknown}`);
  }

  return Array.from(new Set(scopes));
}

export function enforceClientScopes(app: ExternalApp, scopes: string[]) {
  const allowed = new Set(app.allowedScopes);
  const unknown = scopes.find(scope => !allowed.has(scope));
  if (unknown) {
    throw new OAuthError("invalid_scope", `scope is not allowed for this client: ${unknown}`);
  }
}

export function enforceClientGrant(app: ExternalApp, grantType: string) {
  if (!app.allowedGrantTypes.includes(grantType)) {
    throw new OAuthError("unauthorized_client", "grant_type is not allowed for this client", 400);
  }
}

function hasScope(scopes: readonly string[], standard: string, legacy: string) {
  return scopes.includes(standard) || scopes.includes(legacy);
}

export function oauthProfileCompatibility(version: string) {
  if (version === legacyOAuthProfileVersion) {
    return {
      version,
      accessTokenSubject: "user",
      clientCredentialsSubject: "client",
      refreshTokenRotation: true,
      notes: ["legacy claim aliases are preserved"],
    };
  }

  return {
    version: currentOAuthProfileVersion,
    accessTokenSubject: "user",
    clientCredentialsSubject: "client",
    refreshTokenRotation: true,
    notes: ["strict client policy and one-time DCR secret reveal"],
  };
}

async function resolveAuthorizeView(params: AuthorizeParams, user?: User | null) {
  if (params.responseType !== "code") {
    throw new OAuthError("unsupported_response_type", "response_type must be code");
  }

  if (!params.clientId) {
    throw new OAuthError("invalid_request", "client_id is required");
  }

  const app = await findExternalAppByClientId(params.clientId);
  if (!app || app.status !== "active") {
    throw new OAuthError("unauthorized_client", "client is not active");
  }

  if (!params.redirectUri) {
    throw new OAuthError("invalid_request", "redirect_uri is required");
  }

  const redirectUri = normalizeRedirectUri(params.redirectUri);
  if (!redirectUriAllowed(redirectUri, app.allowedRedirectUrls)) {
    throw new OAuthError("invalid_request", "redirect_uri is not registered");
  }

  if (!params.codeChallenge || params.codeChallengeMethod !== "S256") {
    throw new OAuthError("invalid_request", "PKCE S256 is required");
  }

  const scopes = parseOAuthScopes(params.scope);
  enforceClientScopes(app, scopes);
  const existing = user ? await findAuthorization(user.id, app.id) : null;
  const subscriptionOk =
    user && app.requiredProduct
      ? await hasActiveSubscription(user.id, app.requiredProduct)
      : true;

  return {
    app,
    clientId: params.clientId,
    redirectUri,
    scope: scopes.join(" "),
    scopes,
    state: params.state,
    codeChallenge: params.codeChallenge,
    nonce: params.nonce,
    existingScopes: existing?.scopes || [],
    requiredProduct: app.requiredProduct,
    subscriptionOk,
  };
}

export async function getOAuthAuthorizeView(
  searchParams: Record<string, string | string[] | undefined>,
  user?: User | null,
) {
  const requestUri = Array.isArray(searchParams.request_uri) ? searchParams.request_uri[0] : searchParams.request_uri;
  
  if (requestUri) {
    const pushedReq = await findPushedRequest(requestUri);
    if (!pushedReq) {
      throw new OAuthError("invalid_request", "invalid or expired request_uri");
    }
    
    const app = await findExternalAppById(pushedReq.appId);
    if (!app) throw new OAuthError("invalid_client", "client not found");

    return resolveAuthorizeView({
      responseType: "code",
      clientId: app.publicId,
      redirectUri: pushedReq.redirectUri,
      scope: pushedReq.scopes.join(" "),
      state: pushedReq.state || "",
      codeChallenge: pushedReq.codeChallenge || "",
      codeChallengeMethod: pushedReq.codeChallengeMethod || "",
      nonce: pushedReq.nonce || ""
    }, user);
  }

  return resolveAuthorizeView(paramsFromSearch(searchParams), user);
}

export function oauthAuthorizeQuery(view: OAuthAuthorizeView) {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: view.clientId,
    redirect_uri: view.redirectUri,
    scope: view.scope,
    code_challenge: view.codeChallenge,
    code_challenge_method: "S256",
  });

  if (view.state) query.set("state", view.state);
  if (view.nonce) query.set("nonce", view.nonce);

  return query.toString();
}

export function oauthRedirectError(
  redirectUri: string,
  error: string,
  description: string,
  state?: string,
) {
  const target = new URL(redirectUri);
  target.searchParams.set("error", error);
  target.searchParams.set("error_description", description);
  if (state) target.searchParams.set("state", state);
  return target;
}

export async function approveOAuthAuthorization(
  body: Record<string, unknown>,
  user: User,
  req: NextRequest,
) {
  const view = await resolveAuthorizeView(paramsFromBody(body), user);
  const context = requestContext(req);
  const requestedScopes = view.scopes;
  const granted = Array.isArray(body.scopes)
    ? body.scopes.map(String)
    : typeof body.scopes === "string"
      ? [body.scopes]
      : requestedScopes;
  const scopes = granted.filter(scope => requestedScopes.includes(scope));
  const code = randomToken(32);

  if (!view.subscriptionOk) {
    throw new OAuthError("access_denied", "subscription required", 403);
  }

  await createAuthorizationCode({
    code,
    appId: view.app.id,
    userId: user.id,
    redirectUri: view.redirectUri,
    codeChallenge: view.codeChallenge,
    scopes,
    nonce: view.nonce || null,
    ip: context.ip,
    userAgent: context.userAgent,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000),
  });

  await upsertAuthorization({
    userId: user.id,
    appId: view.app.id,
    scopes,
  });

  await recordSecurityEvent({
    userId: user.id,
    eventType: "oauth_authorize",
    result: "approved",
    context,
    metadata: { app: view.app.slug, scopes },
  });

  const target = new URL(view.redirectUri);
  target.searchParams.set("code", code);
  if (view.state) target.searchParams.set("state", view.state);
  return target;
}

export async function denyOAuthAuthorization(
  body: Record<string, unknown>,
  user: User,
  req: NextRequest,
) {
  const view = await resolveAuthorizeView(paramsFromBody(body), user);
  const context = requestContext(req);

  await recordSecurityEvent({
    userId: user.id,
    eventType: "oauth_authorize",
    result: "denied",
    context,
    metadata: { app: view.app.slug },
  });

  return oauthRedirectError(
    view.redirectUri,
    "access_denied",
    "user denied authorization",
    view.state,
  );
}

function pkceS256(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function jsonBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function oauthJwks() {
  return {
    keys: oidcSigningKeys()
      .filter(key => key.status !== "revoked")
      .map(key => {
        const publicKey = createPublicKey(createPrivateKey(key.privateKeyPem)).export({
          format: "jwk",
        }) as Record<string, unknown>;

        return {
          ...publicKey,
          use: "sig",
          alg: "RS256",
          kid: key.kid,
        };
      }),
  };
}

function signJwt(payload: Record<string, unknown>) {
  const signingKey = activeOidcSigningKey();
  const encodedHeader = jsonBase64Url({
    alg: "RS256",
    typ: "JWT",
    kid: signingKey.kid,
  });
  const encodedPayload = jsonBase64Url(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signBytes(
    "RSA-SHA256",
    Buffer.from(signingInput),
    createPrivateKey(signingKey.privateKeyPem),
  );

  return `${signingInput}.${signature.toString("base64url")}`;
}

function createIdToken(input: {
  app: ExternalApp;
  user: User;
  scopes: string[];
  nonce: string | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  const accessTokenTtl = oauthAccessTokenTtlSeconds();
  const claims: Record<string, unknown> = {
    iss: authBaseUrl(),
    sub: input.user.publicId,
    aud: input.app.publicId,
    iat: now,
    exp: now + accessTokenTtl,
  };

  if (input.nonce) {
    claims.nonce = input.nonce;
  }

  if (hasScope(input.scopes, "profile", "profile:read")) {
    claims.name = input.user.firstName;
    claims.preferred_username = input.user.username;
  }

  if (hasScope(input.scopes, "email", "email:read")) {
    claims.email = input.user.email;
    claims.email_verified = Boolean(input.user.emailVerifiedAt);
  }

  if (hasScope(input.scopes, "birthdate", "dob:read") && input.user.dob) {
    claims.birthdate = input.user.dob;
  }

  return signJwt(claims);
}

function clientCredentialsFromBasic(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return null;
    }

    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

export async function authenticateClient(req: NextRequest, body: Record<string, unknown>) {
  const basic = clientCredentialsFromBasic(req);
  const clientId = basic?.clientId || stringParam(body.client_id as string);
  const clientSecret =
    basic?.clientSecret || stringParam(body.client_secret as string);

  if (!clientId) {
    throw new OAuthError("invalid_client", "client_id is required", 401);
  }

  if (clientSecret) {
    const app = await verifyExternalAppClientSecret(clientId, clientSecret);
    if (!app || app.status !== "active") {
      throw new OAuthError("invalid_client", "client authentication failed", 401);
    }
    if (app.tokenEndpointAuthMethod === "none") {
      throw new OAuthError("invalid_client", "public clients must not send client_secret", 401);
    }
    if (basic && app.tokenEndpointAuthMethod !== "client_secret_basic") {
      throw new OAuthError("invalid_client", "client_secret_basic is not allowed for this client", 401);
    }
    if (!basic && app.tokenEndpointAuthMethod !== "client_secret_post") {
      throw new OAuthError("invalid_client", "client_secret_post is not allowed for this client", 401);
    }
    return app;
  }

  const app = await findExternalAppByClientId(clientId);
  if (!app || app.status !== "active") {
    throw new OAuthError("invalid_client", "client authentication failed", 401);
  }
  if (app.tokenEndpointAuthMethod !== "none" || app.clientType !== "public") {
    throw new OAuthError("invalid_client", "client_secret is required", 401);
  }

  return app;
}

async function issueTokenPair(input: {
  app: ExternalApp;
  user: User;
  scopes: string[];
  nonce: string | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  const accessTokenTtl = oauthAccessTokenTtlSeconds();
  const accessToken = signJwt({
    iss: authBaseUrl(),
    sub: input.user.publicId,
    aud: input.app.publicId,
    client_id: input.app.publicId,
    jti: randomToken(16),
    iat: now,
    exp: now + accessTokenTtl,
    scope: input.scopes.join(" "),
  });
  const refreshToken = randomToken(48);

  await createAccessToken({
    token: accessToken,
    appId: input.app.id,
    userId: input.user.id,
    subject: input.user.publicId,
    tokenKind: "user",
    scopes: input.scopes,
    expiresAt: new Date(Date.now() + accessTokenTtl * 1000),
  });

  const response: Record<string, unknown> = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: accessTokenTtl,
    scope: input.scopes.join(" "),
    oauth_profile_version: input.app.oauthProfileVersion,
  };

  if (input.app.issueRefreshTokens && input.app.allowedGrantTypes.includes("refresh_token")) {
    await createRefreshToken({
      token: refreshToken,
      appId: input.app.id,
      userId: input.user.id,
      scopes: input.scopes,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    response.refresh_token = refreshToken;
  }

  if (input.scopes.includes("openid")) {
    response.id_token = createIdToken({
      app: input.app,
      user: input.user,
      scopes: input.scopes,
      nonce: input.nonce,
    });
  }

  return response;
}

export async function exchangeOAuthToken(
  body: Record<string, unknown>,
  req: NextRequest,
) {
  const grantType = stringParam(body.grant_type as string);
  const app = await authenticateClient(req, body);

  if (grantType === "authorization_code") {
    enforceClientGrant(app, "authorization_code");
    const code = stringParam(body.code as string);
    const redirectUri = normalizeRedirectUri(stringParam(body.redirect_uri as string));
    const verifier = stringParam(body.code_verifier as string);

    if (!code || !verifier) {
      throw new OAuthError("invalid_request", "code and code_verifier are required");
    }

    const authorizationCode = await findAuthorizationCode(code);
    if (!authorizationCode) {
      throw new OAuthError("invalid_grant", "authorization code is invalid");
    }

    if (authorizationCode.appId !== app.id) {
      throw new OAuthError("invalid_grant", "authorization code was issued to another client");
    }

    if (authorizationCode.redirectUri !== redirectUri) {
      throw new OAuthError("invalid_grant", "redirect_uri does not match");
    }

    if (!safeEqual(pkceS256(verifier), authorizationCode.codeChallenge)) {
      throw new OAuthError("invalid_grant", "code_verifier is invalid");
    }

    const consumed = await markAuthorizationCodeConsumed(authorizationCode.id);
    if (!consumed) {
      throw new OAuthError("invalid_grant", "authorization code is invalid");
    }

    const user = await findUserById(authorizationCode.userId);
    if (!user || user.status === "banned") {
      throw new OAuthError("invalid_grant", "user is not active");
    }

    return issueTokenPair({
      app,
      user,
      scopes: authorizationCode.scopes,
      nonce: authorizationCode.nonce,
    });
  }

  if (grantType === "refresh_token") {
    enforceClientGrant(app, "refresh_token");
    const refreshToken = stringParam(body.refresh_token as string);
    if (!refreshToken) {
      throw new OAuthError("invalid_request", "refresh_token is required");
    }

    const replacement = randomToken(48);
    const previous = await rotateRefreshToken(refreshToken, replacement, app.id);
    if (!previous) {
      // A rotated token being presented again means the previous holder still
      // has it. Revoke everything for this (app, user) pair to limit damage.
      const reuse = await findRotatedRefreshTokenContext(refreshToken);
      if (reuse) {
        await revokeAllTokensForUserAndApp(reuse);
      }
      throw new OAuthError("invalid_grant", "refresh_token is invalid");
    }

    if (!previous.userId) {
      throw new OAuthError("invalid_grant", "refresh_token is invalid");
    }

    const user = await findUserById(previous.userId);
    if (!user || user.status === "banned") {
      throw new OAuthError("invalid_grant", "user is not active");
    }

    await createRefreshToken({
      token: replacement,
      appId: previous.appId,
      userId: previous.userId,
      scopes: previous.scopes,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    const now = Math.floor(Date.now() / 1000);
    const accessTokenTtl = oauthAccessTokenTtlSeconds();
    const accessToken = signJwt({
      iss: authBaseUrl(),
      sub: user.publicId,
      aud: app.publicId,
      client_id: app.publicId,
      jti: randomToken(16),
      iat: now,
      exp: now + accessTokenTtl,
      scope: previous.scopes.join(" "),
    });
    await createAccessToken({
      token: accessToken,
      appId: previous.appId,
      userId: previous.userId,
      subject: user.publicId,
      tokenKind: "user",
      scopes: previous.scopes,
      expiresAt: new Date(Date.now() + accessTokenTtl * 1000),
    });

    const response: Record<string, unknown> = {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: accessTokenTtl,
      refresh_token: replacement,
      scope: previous.scopes.join(" "),
      oauth_profile_version: app.oauthProfileVersion,
    };

    if (previous.scopes.includes("openid")) {
      response.id_token = createIdToken({
        app,
        user,
        scopes: previous.scopes,
        nonce: null,
      });
    }

    return response;
  }

  if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
    enforceClientGrant(app, "urn:ietf:params:oauth:grant-type:device_code");
    const deviceCodeValue = stringParam(body.device_code as string);
    if (!deviceCodeValue) {
      throw new OAuthError("invalid_request", "device_code is required");
    }

    const { findDeviceCodeByDeviceCode } = await import("../repositories/oauth");
    const deviceCode = await findDeviceCodeByDeviceCode(deviceCodeValue);

    if (!deviceCode || deviceCode.appId !== app.id) {
      throw new OAuthError("invalid_grant", "invalid device_code");
    }

    if (new Date(deviceCode.expiresAt) < new Date()) {
      throw new OAuthError("expired_token", "device_code expired");
    }

    if (deviceCode.lastPolledAt) {
      const elapsed = Date.now() - Date.parse(deviceCode.lastPolledAt);
      if (elapsed < deviceCode.pollIntervalSeconds * 1000) {
        throw new OAuthError("slow_down", "polling too fast", 400);
      }
    }
    await markDeviceCodePolled(deviceCode.id);

    if (deviceCode.status === "pending") {
      throw new OAuthError("authorization_pending", "authorization pending", 400);
    }
    
    if (deviceCode.status === "denied") {
      throw new OAuthError("access_denied", "authorization denied", 400);
    }

    if (deviceCode.status === "expired" || deviceCode.status === "consumed") {
      throw new OAuthError("expired_token", "device_code expired", 400);
    }

    const consumed = await consumeDeviceCode(deviceCode.id);
    if (!consumed || !consumed.userId) {
      throw new OAuthError("invalid_grant", "device code approved but no user found");
    }

    const user = await findUserById(consumed.userId);
    if (!user || user.status === "banned") {
      throw new OAuthError("invalid_grant", "user is not active");
    }

    const nonce = null;
    return await issueTokenPair({ app, user, scopes: consumed.scopes, nonce });
  }

  if (grantType === "client_credentials") {
    enforceClientGrant(app, "client_credentials");
    const basic = clientCredentialsFromBasic(req);
    const clientSecret = basic?.clientSecret || stringParam(body.client_secret as string);
    if (!clientSecret) {
      throw new OAuthError("invalid_client", "client_secret is required for client_credentials grant", 401);
    }

    const requestedScope = stringParam(body.scope as string);
    const scopes = requestedScope ? parseOAuthScopes(requestedScope) : [];
    enforceClientScopes(app, scopes);

    const now = Math.floor(Date.now() / 1000);
    const accessTokenTtl = oauthAccessTokenTtlSeconds();
    const accessToken = signJwt({
      iss: authBaseUrl(),
      sub: app.publicId,
      aud: app.publicId,
      client_id: app.publicId,
      jti: randomToken(16),
      iat: now,
      exp: now + accessTokenTtl,
      scope: scopes.join(" "),
    });

    await createAccessToken({
      token: accessToken,
      appId: app.id,
      userId: null,
      subject: app.publicId,
      tokenKind: "client",
      scopes,
      expiresAt: new Date(Date.now() + accessTokenTtl * 1000),
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: accessTokenTtl,
      scope: scopes.join(" "),
      oauth_profile_version: app.oauthProfileVersion,
    };
  }

  throw new OAuthError("unsupported_grant_type", "grant_type is unsupported");
}

export async function oauthUserInfo(accessToken: string) {
  const grant = await findAccessToken(accessToken);
  if (
    !grant ||
    grant.tokenKind !== "user" ||
    !grant.user ||
    grant.user.status === "banned" ||
    grant.app.status !== "active"
  ) {
    return null;
  }

  const scopes = grant.scopes;
  const user = grant.user;

  const result: Record<string, unknown> = {
    sub: user.publicId,
    id: user.publicId,
  };

  if (hasScope(scopes, "profile", "profile:read")) {
    result.username = user.username;
    result.preferred_username = user.username;
    result.name = user.firstName;
    result.firstName = user.firstName;
    result.bio = user.bio;
  }

  if (hasScope(scopes, "email", "email:read")) {
    result.email = user.email;
    result.email_verified = Boolean(user.emailVerifiedAt);
  }

  if (hasScope(scopes, "birthdate", "dob:read")) {
    result.birthdate = user.dob;
  }

  if (hasScope(scopes, "subscription:read", "subscription:read")) {
    const subs = await listSubscriptionsForUser(user.id);
    result.subscriptions = subs
      .filter(s => s.status === "active" || s.status === "trial")
      .map(s => ({ product: s.product, status: s.status, expiresAt: s.expiresAt }));
  }

  return result;
}

export async function introspectOAuthToken(
  body: Record<string, unknown>,
  req: NextRequest,
) {
  const app = await authenticateClient(req, body);
  const token = stringParam(body.token as string);
  if (!token) {
    return { active: false };
  }

  const grant = await findAccessToken(token);
  if (
    !grant ||
    grant.app.id !== app.id ||
    grant.app.status !== "active" ||
    (grant.user && grant.user.status === "banned")
  ) {
    return { active: false };
  }

  return {
    active: true,
    client_id: grant.app.publicId,
    sub: grant.subject,
    token_type: grant.tokenKind === "client" ? "client_credentials" : "access_token",
    scope: grant.scopes.join(" "),
    exp: Math.floor(Date.parse(grant.expiresAt) / 1000),
  };
}

export async function revokeOAuthToken(
  body: Record<string, unknown>,
  req: NextRequest,
) {
  const app = await authenticateClient(req, body);
  const token = stringParam(body.token as string);
  const hint = stringParam(body.token_type_hint as string);

  if (!token) {
    return;
  }

  if (!hint || hint === "access_token") {
    await revokeAccessToken(token, app.id);
  }

  if (!hint || hint === "refresh_token") {
    const revoked = await revokeRefreshToken(token, app.id);
    if (revoked?.userId) {
      await revokeAccessTokensForRefreshGrant({
        appId: revoked.appId,
        userId: revoked.userId,
      });
    }
  }
}

export function oauthServerMetadata() {
  const issuer = authBaseUrl();
  const metadata: Record<string, unknown> = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
    introspection_endpoint: `${issuer}/api/oauth/introspect`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    jwks_uri: `${issuer}/oauth/jwks`,
    response_types_supported: ["code"],
    device_authorization_endpoint: `${issuer}/api/oauth/device/code`,
    pushed_authorization_request_endpoint: `${issuer}/api/oauth/par`,
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
      "urn:ietf:params:oauth:grant-type:device_code",
    ],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
    code_challenge_methods_supported: ["S256"],
    oauth_profile_versions_supported: [
      currentOAuthProfileVersion,
      legacyOAuthProfileVersion,
    ],
    oauth_profile_version_current: currentOAuthProfileVersion,
    scopes_supported: [
      "openid",
      "profile",
      "email",
      "birthdate",
      "profile:read",
      "email:read",
      "dob:read",
      "subscription:read",
    ],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    claims_supported: [
      "sub",
      "name",
      "preferred_username",
      "email",
      "email_verified",
      "birthdate",
    ],
  };

  if (oauthDynamicRegistrationToken()) {
    metadata.registration_endpoint = `${issuer}/api/oauth/register`;
  }

  return metadata;
}

import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { authBaseUrl } from "../config";
import { randomToken, safeEqual } from "../crypto";
import { requestContext } from "../http";
import { findAuthorization, upsertAuthorization } from "../repositories/authorizations";
import {
  findExternalAppByClientId,
  verifyExternalAppClientSecret,
} from "../repositories/externalApps";
import {
  createAccessToken,
  createAuthorizationCode,
  createRefreshToken,
  findAccessToken,
  findAuthorizationCode,
  markAuthorizationCodeConsumed,
  rotateRefreshToken,
} from "../repositories/oauth";
import { recordSecurityEvent } from "../repositories/securityEvents";
import type { ExternalApp, User } from "../types";
import { parseScopes } from "../validation";

const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
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

function parseOAuthScopes(scope: string) {
  if (!scope) {
    return ["profile:read"];
  }

  return parseScopes(scope.split(/\s+/).filter(Boolean));
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
  const existing = user ? await findAuthorization(user.id, app.id) : null;

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
  };
}

export async function getOAuthAuthorizeView(
  searchParams: Record<string, string | string[] | undefined>,
  user?: User | null,
) {
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

async function authenticateClient(req: NextRequest, body: Record<string, unknown>) {
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
    return app;
  }

  const app = await findExternalAppByClientId(clientId);
  if (!app || app.status !== "active") {
    throw new OAuthError("invalid_client", "client authentication failed", 401);
  }

  return app;
}

async function issueTokenPair(input: {
  appId: number;
  userId: number;
  scopes: string[];
}) {
  const accessToken = randomToken(48);
  const refreshToken = randomToken(48);

  await createAccessToken({
    token: accessToken,
    appId: input.appId,
    userId: input.userId,
    scopes: input.scopes,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
  });

  await createRefreshToken({
    token: refreshToken,
    appId: input.appId,
    userId: input.userId,
    scopes: input.scopes,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: input.scopes.join(" "),
  };
}

export async function exchangeOAuthToken(
  body: Record<string, unknown>,
  req: NextRequest,
) {
  const grantType = stringParam(body.grant_type as string);
  const app = await authenticateClient(req, body);

  if (grantType === "authorization_code") {
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

    return issueTokenPair({
      appId: app.id,
      userId: authorizationCode.userId,
      scopes: authorizationCode.scopes,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = stringParam(body.refresh_token as string);
    if (!refreshToken) {
      throw new OAuthError("invalid_request", "refresh_token is required");
    }

    const replacement = randomToken(48);
    const previous = await rotateRefreshToken(refreshToken, replacement, app.id);
    if (!previous) {
      throw new OAuthError("invalid_grant", "refresh_token is invalid");
    }

    await createRefreshToken({
      token: replacement,
      appId: previous.appId,
      userId: previous.userId,
      scopes: previous.scopes,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    const accessToken = randomToken(48);
    await createAccessToken({
      token: accessToken,
      appId: previous.appId,
      userId: previous.userId,
      scopes: previous.scopes,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: replacement,
      scope: previous.scopes.join(" "),
    };
  }

  throw new OAuthError("unsupported_grant_type", "grant_type is unsupported");
}

export async function oauthUserInfo(accessToken: string) {
  const grant = await findAccessToken(accessToken);
  if (!grant || grant.user.status === "banned" || grant.app.status !== "active") {
    return null;
  }

  const scopes = grant.scopes;
  const user = grant.user;

  return {
    sub: user.publicId,
    id: user.publicId,
    username: scopes.includes("profile:read") ? user.username : undefined,
    firstName: scopes.includes("profile:read") ? user.firstName : undefined,
    bio: scopes.includes("profile:read") ? user.bio : undefined,
    email: scopes.includes("email:read") ? user.email : undefined,
    birthdate: scopes.includes("dob:read") ? user.dob : undefined,
  };
}

export async function introspectOAuthToken(
  body: Record<string, unknown>,
  req: NextRequest,
) {
  await authenticateClient(req, body);
  const token = stringParam(body.token as string);
  if (!token) {
    return { active: false };
  }

  const grant = await findAccessToken(token);
  if (!grant || grant.user.status === "banned" || grant.app.status !== "active") {
    return { active: false };
  }

  return {
    active: true,
    client_id: grant.app.publicId,
    sub: grant.user.publicId,
    scope: grant.scopes.join(" "),
    exp: Math.floor(Date.parse(grant.expiresAt) / 1000),
  };
}

export function oauthServerMetadata() {
  const issuer = authBaseUrl();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
    introspection_endpoint: `${issuer}/api/oauth/introspect`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [
      "profile:read",
      "email:read",
      "dob:read",
      "subscription:read",
    ],
  };
}

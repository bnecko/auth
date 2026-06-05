import type { NextRequest } from "next/server";
import { activationTtlMinutes, authBaseUrl } from "../config";
import { publicId, randomToken } from "../crypto";
import { apiError, requestContext } from "../http";
import redis from "../redis";
import {
  approveActivation,
  cancelActivation,
  createActivationRequest,
  denyActivation,
  findActivationByPublicId,
  findActivationByToken,
  listActivationsForApp,
} from "../repositories/activationRequests";
import {
  listAuthorizationsForApp,
  revokeAuthorization,
  upsertAuthorization,
} from "../repositories/authorizations";
import { findExternalAppByApiKey } from "../repositories/externalApps";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { hasActiveSubscription } from "../repositories/subscriptions";
import type { User } from "../types";
import { toIso } from "../time";
import { parseScopes } from "../validation";
import { enqueueWebhookEvent } from "../webhooks";

// Carries a machine-readable code and HTTP status so integrator-facing routes
// can return {error, code} with the right status instead of a bare string.
// Mirrors OAuthError in services/oauth.ts.
export class ActivationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// Maps a thrown error to the integrator API envelope. Known ActivationErrors
// surface their code and status; anything else collapses to a generic 400 so
// internal detail never leaks to the caller.
export function activationErrorResponse(err: unknown) {
  if (err instanceof ActivationError) {
    return apiError(err.message, err.code, err.status);
  }
  return apiError("activation failed", "internal_error", 400);
}

// Webhook enqueue is best-effort: a downstream side effect must never
// roll back the activation state transition the user just authorized.
// Failures are recorded as a security event so an admin can re-fire
// from the deliveries table.
async function fireActivationWebhook(input: {
  appId: number;
  userId: number;
  eventType: "activation.approved" | "activation.denied" | "activation.cancelled";
  payload: Record<string, unknown>;
}) {
  try {
    await enqueueWebhookEvent({
      appId: input.appId,
      eventType: input.eventType,
      payload: input.payload,
    });
  } catch (err) {
    await recordSecurityEvent({
      userId: input.userId,
      eventType: "webhook_enqueue_failed",
      result: err instanceof Error ? err.message : "unknown",
      context: { ip: "", userAgent: "activation-service", country: "" },
      metadata: { activationId: input.payload.id, eventType: input.eventType },
    });
  }
}

type ActivationCreateResult = {
  id: string;
  token: string;
  activationUrl: string;
  expiresAt: string | null;
};

export async function createExternalActivationRequest(
  apiKey: string,
  body: Record<string, unknown>,
  req: NextRequest,
  idempotencyKey?: string | null,
): Promise<ActivationCreateResult> {
  const app = await findExternalAppByApiKey(apiKey);
  if (!app || app.status !== "active") {
    throw new ActivationError("invalid_credentials", "invalid app credentials", 401);
  }

  // Idempotency: a retried create with the same key returns the original
  // response (including its one-time token) instead of minting a duplicate.
  // The cached value lives for the activation TTL, which is the only window in
  // which a replay is meaningful. Keyed per app so keys cannot collide across
  // tenants.
  const idemKey =
    idempotencyKey && idempotencyKey.length >= 8 && idempotencyKey.length <= 255
      ? `idem:activation:${app.id}:${idempotencyKey}`
      : null;
  if (idemKey) {
    const cached = await redis.get(idemKey);
    if (cached) {
      return JSON.parse(cached) as ActivationCreateResult;
    }
  }

  const context = requestContext(req);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + activationTtlMinutes() * 60_000);
  const scopes = parseScopes(body.scopes);
  const returnUrl = typeof body.returnUrl === "string" ? body.returnUrl : null;
  const callbackUrl =
    typeof body.callbackUrl === "string" ? body.callbackUrl : app.callbackUrl;

  if (returnUrl && !isAllowedReturnUrl(returnUrl, app.allowedRedirectUrls)) {
    throw new ActivationError("return_url_not_allowed", "return url is not allowed", 400);
  }

  const request = await createActivationRequest({
    publicId: publicId("act"),
    appId: app.id,
    token,
    scopes,
    requestedSubject:
      typeof body.requestedSubject === "string" ? body.requestedSubject : null,
    callbackUrl,
    returnUrl,
    ip: context.ip,
    userAgent: context.userAgent,
    expiresAt,
  });

  const result: ActivationCreateResult = {
    id: request.publicId,
    token,
    activationUrl: `${authBaseUrl()}/activate?token=${token}`,
    expiresAt: toIso(request.expiresAt),
  };

  if (idemKey) {
    // SET NX so a concurrent create with the same key does not clobber the
    // canonical response. If we lost the race, return the winner's cached
    // value; our just-created row is orphaned and expires on its own.
    const stored = await redis.set(
      idemKey,
      JSON.stringify(result),
      "EX",
      activationTtlMinutes() * 60,
      "NX",
    );
    if (stored === null) {
      const existing = await redis.get(idemKey);
      if (existing) {
        return JSON.parse(existing) as ActivationCreateResult;
      }
    }
  }

  return result;
}

export async function getActivationForUser(token: string, user: User) {
  const activation = await findActivationByToken(token);
  if (!activation) {
    return null;
  }

  const expired = Date.parse(activation.expiresAt) <= Date.now();
  const requiredProduct = activation.app.requiredProduct;
  const subscriptionOk = requiredProduct
    ? await hasActiveSubscription(user.id, requiredProduct)
    : true;

  return {
    activation,
    expired,
    requiredProduct,
    subscriptionOk,
  };
}

export async function approveActivationForUser(
  publicIdValue: string,
  user: User,
  req: NextRequest,
  grantedScopes?: string[],
) {
  const context = requestContext(req);
  const activation = await findActivationByPublicId(publicIdValue);
  if (!activation || activation.status !== "pending") {
    throw new ActivationError("not_pending", "activation is not pending", 409);
  }

  if (Date.parse(activation.expiresAt) <= Date.now()) {
    throw new ActivationError("expired", "activation expired", 410);
  }

  if (activation.app.requiredProduct) {
    const ok = await hasActiveSubscription(user.id, activation.app.requiredProduct);
    if (!ok) {
      throw new ActivationError("subscription_required", "subscription required", 403);
    }
  }

  const approved = await approveActivation(publicIdValue, user.id);
  if (!approved) {
    throw new ActivationError("not_pending", "activation could not be approved", 409);
  }

  const finalScopes = grantedScopes
    ? grantedScopes.filter(s => activation.scopes.includes(s))
    : activation.scopes;

  await upsertAuthorization({
    userId: user.id,
    appId: activation.app.id,
    scopes: finalScopes,
  });

  await recordSecurityEvent({
    userId: user.id,
    eventType: "activation_approved",
    result: "ok",
    context,
    metadata: { activationId: publicIdValue, app: activation.app.slug },
  });

  // Re-validate the stored return URL against the app's current allowlist
  // before handing it back. The list may have been tightened since creation,
  // and the validator hardening means previously-stored values that only
  // passed the old startsWith check should no longer be honoured. Null means
  // the caller has no app URL to bounce to and should show success in-app.
  const safeReturnUrl =
    activation.returnUrl &&
    isAllowedReturnUrl(activation.returnUrl, activation.app.allowedRedirectUrls)
      ? activation.returnUrl
      : null;

  await fireActivationWebhook({
    appId: activation.app.id,
    userId: user.id,
    eventType: "activation.approved",
    payload: {
      id: publicIdValue,
      status: "approved",
      approvedUserId: user.publicId,
      scopes: finalScopes,
      appId: activation.app.publicId,
      returnUrl: activation.returnUrl,
    },
  });

  return {
    activation,
    returnUrl: safeReturnUrl,
  };
}

export async function denyActivationForUser(
  publicIdValue: string,
  user: User,
  req: NextRequest,
  reason = "user_declined",
) {
  const context = requestContext(req);
  const activation = await denyActivation(publicIdValue, reason);

  await recordSecurityEvent({
    userId: user.id,
    eventType: "activation_denied",
    result: activation ? "ok" : "not_pending",
    context,
    metadata: { activationId: publicIdValue },
  });

  if (activation) {
    await fireActivationWebhook({
      appId: activation.externalAppId,
      userId: user.id,
      eventType: "activation.denied",
      payload: {
        id: publicIdValue,
        status: "denied",
        deniedReason: reason,
        deniedAt: new Date().toISOString(),
      },
    });
  }
}

// Validates a returnUrl against an app's allowed list. Comparison is by
// exact URL origin (and optional path prefix), not raw string startsWith,
// because "https://example.com" starts-with-matches "https://example.com.evil.com".
// An empty allowlist is treated as "no return URLs permitted".
function isAllowedReturnUrl(returnUrl: string, allowed: readonly string[]) {
  if (allowed.length === 0) {
    return false;
  }

  let candidate: URL;
  try {
    candidate = new URL(returnUrl);
  } catch {
    return false;
  }

  if (candidate.protocol !== "https:" && candidate.protocol !== "http:") {
    return false;
  }

  return allowed.some(entry => {
    let prefix: URL;
    try {
      prefix = new URL(entry);
    } catch {
      return false;
    }

    if (prefix.origin !== candidate.origin) {
      return false;
    }

    if (prefix.pathname === "/" || prefix.pathname === "") {
      return true;
    }

    const prefixPath = prefix.pathname.endsWith("/")
      ? prefix.pathname
      : `${prefix.pathname}/`;
    const candidatePath = candidate.pathname.endsWith("/")
      ? candidate.pathname
      : `${candidate.pathname}/`;

    return candidatePath.startsWith(prefixPath);
  });
}

export async function cancelExternalActivationRequest(
  apiKey: string,
  publicIdValue: string,
) {
  const app = await findExternalAppByApiKey(apiKey);
  if (!app || app.status !== "active") {
    throw new ActivationError("invalid_credentials", "invalid app credentials", 401);
  }

  const cancelled = await cancelActivation(publicIdValue, app.id);
  if (cancelled) {
    await fireActivationWebhook({
      appId: app.id,
      userId: cancelled.approvedUserId || 0,
      eventType: "activation.cancelled",
      payload: {
        id: publicIdValue,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      },
    });
  }
  return cancelled;
}

async function requireApp(apiKey: string) {
  const app = await findExternalAppByApiKey(apiKey);
  if (!app || app.status !== "active") {
    throw new ActivationError("invalid_credentials", "invalid app credentials", 401);
  }
  return app;
}

// The app's own configuration, so an integrator can validate its redirect
// allowlist and scopes before sending users through a flow that would 400.
export async function getAppForApiKey(apiKey: string) {
  const app = await requireApp(apiKey);
  return {
    id: app.publicId,
    name: app.name,
    slug: app.slug,
    status: app.status,
    callbackUrl: app.callbackUrl,
    allowedRedirectUrls: app.allowedRedirectUrls,
    allowedScopes: app.allowedScopes,
    requiredProduct: app.requiredProduct,
  };
}

export async function listActivationRequestsForApp(
  apiKey: string,
  filter: { subject?: string | null; status?: string | null },
) {
  const app = await requireApp(apiKey);
  const rows = await listActivationsForApp({
    appId: app.id,
    subject: filter.subject,
    status: filter.status,
  });
  return rows.map(row => ({
    id: row.publicId,
    status: row.status,
    requestedSubject: row.requestedSubject,
    approvedUserId: row.approvedUserId,
    deniedReason: row.status === "denied" ? row.deniedReason : null,
    createdAt: toIso(row.createdAt),
    expiresAt: toIso(row.expiresAt),
  }));
}

export async function listAppAuthorizations(apiKey: string) {
  const app = await requireApp(apiKey);
  const rows = await listAuthorizationsForApp(app.id);
  return rows.map(row => ({
    subject: row.subject,
    scopes: row.scopes,
    createdAt: toIso(row.createdAt),
  }));
}

// Revokes the standing grant a user gave this app. The activation row stays as
// historical record; revoking the authorization is what cuts off the profile
// (the status endpoint stops returning it and reports revoked: true).
export async function revokeActivationForApp(
  apiKey: string,
  publicIdValue: string,
  req: NextRequest,
) {
  const app = await requireApp(apiKey);
  const context = requestContext(req);
  const activation = await findActivationByPublicId(publicIdValue);
  if (!activation || activation.app.id !== app.id) {
    throw new ActivationError("not_found", "activation not found", 404);
  }
  if (activation.status !== "approved" || !activation.approvedUserId) {
    throw new ActivationError("not_approved", "activation is not approved", 409);
  }

  await revokeAuthorization(activation.approvedUserId, app.id);
  await recordSecurityEvent({
    userId: activation.approvedUserId,
    eventType: "activation_revoked",
    result: "ok",
    context,
    metadata: { activationId: publicIdValue, app: app.slug },
  });

  return { id: publicIdValue, revoked: true };
}

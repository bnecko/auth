import type { NextRequest } from "next/server";
import { activationTtlMinutes, authBaseUrl } from "../config";
import { publicId, randomToken } from "../crypto";
import { requestContext } from "../http";
import {
  approveActivation,
  cancelActivation,
  createActivationRequest,
  denyActivation,
  findActivationByPublicId,
  findActivationByToken,
} from "../repositories/activationRequests";
import { upsertAuthorization } from "../repositories/authorizations";
import { findExternalAppByApiKey } from "../repositories/externalApps";
import { recordSecurityEvent } from "../repositories/securityEvents";
import { hasActiveSubscription } from "../repositories/subscriptions";
import type { User } from "../types";
import { parseScopes } from "../validation";
import { enqueueWebhookEvent } from "../webhooks";

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

export async function createExternalActivationRequest(
  apiKey: string,
  body: Record<string, unknown>,
  req: NextRequest,
) {
  const app = await findExternalAppByApiKey(apiKey);
  if (!app || app.status !== "active") {
    throw new Error("invalid app credentials");
  }

  const context = requestContext(req);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + activationTtlMinutes() * 60_000);
  const scopes = parseScopes(body.scopes);
  const returnUrl = typeof body.returnUrl === "string" ? body.returnUrl : null;
  const callbackUrl =
    typeof body.callbackUrl === "string" ? body.callbackUrl : app.callbackUrl;

  if (returnUrl && !isAllowedReturnUrl(returnUrl, app.allowedRedirectUrls)) {
    throw new Error("return url is not allowed");
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

  return {
    id: request.publicId,
    token,
    activationUrl: `${authBaseUrl()}/activate?token=${token}`,
    expiresAt: request.expiresAt,
  };
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
    throw new Error("activation is not pending");
  }

  if (Date.parse(activation.expiresAt) <= Date.now()) {
    throw new Error("activation expired");
  }

  if (activation.app.requiredProduct) {
    const ok = await hasActiveSubscription(user.id, activation.app.requiredProduct);
    if (!ok) {
      throw new Error("subscription required");
    }
  }

  const approved = await approveActivation(publicIdValue, user.id);
  if (!approved) {
    throw new Error("activation could not be approved");
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
  // before redirecting. The list may have been tightened since creation,
  // and the validator hardening means previously-stored values that only
  // passed the old startsWith check should no longer be honoured.
  const safeRedirect =
    activation.returnUrl &&
    isAllowedReturnUrl(activation.returnUrl, activation.app.allowedRedirectUrls)
      ? activation.returnUrl
      : "/";

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
    redirectTo: safeRedirect,
  };
}

export async function denyActivationForUser(
  publicIdValue: string,
  user: User,
  req: NextRequest,
) {
  const context = requestContext(req);
  const activation = await denyActivation(publicIdValue);

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
    throw new Error("invalid app credentials");
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

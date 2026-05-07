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

  if (returnUrl && app.allowedRedirectUrls.length > 0) {
    const allowed = app.allowedRedirectUrls.some(prefix =>
      returnUrl.startsWith(prefix),
    );
    if (!allowed) {
      throw new Error("return url is not allowed");
    }
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

  await upsertAuthorization({
    userId: user.id,
    appId: activation.app.id,
    scopes: activation.scopes,
  });

  await recordSecurityEvent({
    userId: user.id,
    eventType: "activation_approved",
    result: "ok",
    context,
    metadata: { activationId: publicIdValue, app: activation.app.slug },
  });

  return {
    activation,
    redirectTo: activation.returnUrl || "/",
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
}

export async function cancelExternalActivationRequest(
  apiKey: string,
  publicIdValue: string,
) {
  const app = await findExternalAppByApiKey(apiKey);
  if (!app || app.status !== "active") {
    throw new Error("invalid app credentials");
  }

  return cancelActivation(publicIdValue, app.id);
}

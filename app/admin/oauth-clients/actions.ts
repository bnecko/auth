"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomToken } from "@/lib/server/crypto";
import { requestContextFromHeaders } from "@/lib/server/http";
import {
  approveOAuthClientRegistrationRequest,
  denyOAuthClientRegistrationRequest,
  findOAuthClientRegistrationRequestById,
} from "@/lib/server/repositories/oauthClientRegistrations";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { getCurrentSession } from "@/lib/server/session";

function slugFor(name: string) {
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${stem || "oauth-client"}-${randomToken(4)}`;
}

export async function approveOAuthClientRegistrationAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const id = Number(formData.get("request_id") || 0);
  const request = id ? await findOAuthClientRegistrationRequestById(id) : null;
  if (!request || request.status !== "pending") {
    throw new Error("Registration request is not pending");
  }

  const clientSecret = request.clientType === "confidential"
    ? `sec_${randomToken(32)}`
    : null;
  const approved = await approveOAuthClientRegistrationRequest({
    id,
    publicId: request.publicId,
    slug: slugFor(request.clientName),
    apiKey: clientSecret || `sec_${randomToken(32)}`,
    clientSecret,
    reviewedByUserId: current.user.id,
  });
  if (!approved) {
    throw new Error("Registration request could not be approved");
  }

  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "oauth_client_registration_review",
    result: "approved",
    context: requestContextFromHeaders(await headers()),
    metadata: { requestId: request.publicId, clientId: request.publicId },
  });

  revalidatePath("/admin/oauth-clients");
}

export async function denyOAuthClientRegistrationAction(formData: FormData) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const id = Number(formData.get("request_id") || 0);
  const denied = id
    ? await denyOAuthClientRegistrationRequest({
        id,
        reviewedByUserId: current.user.id,
      })
    : null;
  if (!denied) {
    throw new Error("Registration request could not be denied");
  }

  await recordSecurityEvent({
    userId: current.user.id,
    eventType: "oauth_client_registration_review",
    result: "denied",
    context: requestContextFromHeaders(await headers()),
    metadata: { requestId: denied.publicId, clientId: denied.publicId },
  });

  revalidatePath("/admin/oauth-clients");
}

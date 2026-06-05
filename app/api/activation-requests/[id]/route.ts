import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { apiError, json } from "@/lib/server/http";
import { toIso } from "@/lib/server/time";
import { findExternalAppByApiKey } from "@/lib/server/repositories/externalApps";
import { findActivationByPublicId } from "@/lib/server/repositories/activationRequests";
import { findUserById } from "@/lib/server/repositories/users";
import { findAuthorization } from "@/lib/server/repositories/authorizations";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = bearerToken(req);
  if (!apiKey) {
    return apiError("missing bearer api key", "unauthorized", 401);
  }

  const app = await findExternalAppByApiKey(apiKey);
  if (!app) {
    return apiError("invalid app credentials", "invalid_credentials", 401);
  }

  const { id } = await params;
  const activation = await findActivationByPublicId(id);
  if (!activation || activation.app.id !== app.id) {
    return apiError("activation not found", "not_found", 404);
  }

  // A pending row whose expires_at has passed without any user
  // action is effectively expired. We don't have a sweep that flips
  // the column yet, so derive the effective status at read time so
  // polling integrators don't see "pending" forever.
  const effectiveStatus =
    activation.status === "pending" &&
    Date.parse(activation.expiresAt) <= Date.now()
      ? "expired"
      : activation.status;

  let profile = null;
  if (effectiveStatus === "approved" && activation.approvedUserId) {
    const user = await findUserById(activation.approvedUserId);
    const auth = await findAuthorization(activation.approvedUserId, app.id);
    if (user && auth) {
      profile = {
        id: user.publicId,
        firstName: user.firstName,
        username: user.username,
        bio: user.bio,
        email: auth.scopes.includes("email:read") ? user.email : null,
        dob: auth.scopes.includes("dob:read") ? user.dob : null,
      };
    }
  }

  return json({
    id: activation.publicId,
    status: effectiveStatus,
    approvedUserId: activation.approvedUserId,
    deniedReason: effectiveStatus === "denied" ? activation.deniedReason : null,
    expiresAt: toIso(activation.expiresAt),
    profile,
  });
}

import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { badRequest, json, unauthorized } from "@/lib/server/http";
import { findExternalAppByApiKey } from "@/lib/server/repositories/externalApps";
import { findActivationByPublicId } from "@/lib/server/repositories/activationRequests";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = bearerToken(req);
  if (!apiKey) {
    return unauthorized();
  }

  const app = await findExternalAppByApiKey(apiKey);
  if (!app) {
    return unauthorized();
  }

  const { id } = await params;
  const activation = await findActivationByPublicId(id);
  if (!activation || activation.app.id !== app.id) {
    return badRequest("activation not found");
  }

  return json({
    id: activation.publicId,
    status: activation.status,
    approvedUserId: activation.approvedUserId,
    expiresAt: activation.expiresAt,
  });
}

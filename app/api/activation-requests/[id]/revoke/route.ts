import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { apiError, json } from "@/lib/server/http";
import {
  activationErrorResponse,
  revokeActivationForApp,
} from "@/lib/server/services/activation";

export const runtime = "nodejs";

// Revoke a user's standing grant to this app. The status endpoint then reports
// revoked: true and stops returning the profile.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = bearerToken(req);
  if (!apiKey) {
    return apiError("missing bearer api key", "unauthorized", 401);
  }

  try {
    const { id } = await params;
    return json(await revokeActivationForApp(apiKey, id, req));
  } catch (err) {
    return activationErrorResponse(err);
  }
}

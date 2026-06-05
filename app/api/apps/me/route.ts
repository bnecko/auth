import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { apiError, json } from "@/lib/server/http";
import {
  activationErrorResponse,
  getAppForApiKey,
} from "@/lib/server/services/activation";

export const runtime = "nodejs";

// The calling app's own configuration, so an integrator can validate its
// redirect allowlist and scopes before sending users into a flow that 400s.
export async function GET(req: NextRequest) {
  const apiKey = bearerToken(req);
  if (!apiKey) {
    return apiError("missing bearer api key", "unauthorized", 401);
  }

  try {
    return json(await getAppForApiKey(apiKey));
  } catch (err) {
    return activationErrorResponse(err);
  }
}

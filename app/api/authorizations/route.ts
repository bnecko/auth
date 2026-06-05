import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { apiError, json } from "@/lib/server/http";
import {
  activationErrorResponse,
  listAppAuthorizations,
} from "@/lib/server/services/activation";

export const runtime = "nodejs";

// The standing grants users have given this app: subject (user public id) and
// granted scopes. Lets an integrator list and reconcile its authorized users.
export async function GET(req: NextRequest) {
  const apiKey = bearerToken(req);
  if (!apiKey) {
    return apiError("missing bearer api key", "unauthorized", 401);
  }

  try {
    return json({ authorizations: await listAppAuthorizations(apiKey) });
  } catch (err) {
    return activationErrorResponse(err);
  }
}

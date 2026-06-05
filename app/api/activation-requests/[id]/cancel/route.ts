import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { apiError, json } from "@/lib/server/http";
import {
  activationErrorResponse,
  cancelExternalActivationRequest,
} from "@/lib/server/services/activation";

export const runtime = "nodejs";

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
    const activation = await cancelExternalActivationRequest(apiKey, id);
    if (!activation) {
      return apiError("activation not found or not pending", "not_found", 404);
    }
    return json({ status: activation.status });
  } catch (err) {
    return activationErrorResponse(err);
  }
}

import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { apiError, json, requestBody } from "@/lib/server/http";
import {
  activationErrorResponse,
  createExternalActivationRequest,
  listActivationRequestsForApp,
} from "@/lib/server/services/activation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const apiKey = bearerToken(req);
  if (!apiKey) {
    return apiError("missing bearer api key", "unauthorized", 401);
  }

  try {
    const body = await requestBody(req);
    const result = await createExternalActivationRequest(apiKey, body, req);
    return json(result, 201);
  } catch (err) {
    return activationErrorResponse(err);
  }
}

// List this app's activation requests, optionally filtered by ?subject= and
// ?status=, so an integrator that lost the request id can recover it.
export async function GET(req: NextRequest) {
  const apiKey = bearerToken(req);
  if (!apiKey) {
    return apiError("missing bearer api key", "unauthorized", 401);
  }

  try {
    const requests = await listActivationRequestsForApp(apiKey, {
      subject: req.nextUrl.searchParams.get("subject"),
      status: req.nextUrl.searchParams.get("status"),
    });
    return json({ requests });
  } catch (err) {
    return activationErrorResponse(err);
  }
}

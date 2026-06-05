import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { apiError, json, rateLimited, requestBody } from "@/lib/server/http";
import { hashToken } from "@/lib/server/crypto";
import { rateLimit } from "@/lib/server/rateLimit";
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

  const rl = await rateLimit(`rl:activation:create:${hashToken(apiKey)}`, 60, 60_000);
  if (!rl.success) {
    return rateLimited(rl.reset);
  }

  try {
    const body = await requestBody(req);
    const idempotencyKey = req.headers.get("idempotency-key");
    const result = await createExternalActivationRequest(apiKey, body, req, idempotencyKey);
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

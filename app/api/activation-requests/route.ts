import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { badRequest, json, requestBody, unauthorized } from "@/lib/server/http";
import { createExternalActivationRequest } from "@/lib/server/services/activation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const apiKey = bearerToken(req);
  if (!apiKey) {
    return unauthorized();
  }

  try {
    const body = await requestBody(req);
    const result = await createExternalActivationRequest(apiKey, body, req);
    return json(result, 201);
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "activation failed");
  }
}

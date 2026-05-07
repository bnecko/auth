import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { badRequest, json, requestBody } from "@/lib/server/http";
import { submitBearerRequest } from "@/lib/server/services/bearer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) {
    return auth.response;
  }

  const body = await requestBody(req);
  const appName = typeof body.appName === "string" ? body.appName : "";
  const reason = typeof body.reason === "string" ? body.reason : "";

  try {
    const request = await submitBearerRequest({
      user: auth.session.user,
      appName,
      reason,
      req,
    });

    return json({
      id: request.publicId,
      status: request.status,
      appName: request.appName,
      createdAt: request.createdAt,
    });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "request failed");
  }
}

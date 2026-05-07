import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { badRequest, json, unauthorized } from "@/lib/server/http";
import { cancelExternalActivationRequest } from "@/lib/server/services/activation";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = bearerToken(req);
  if (!apiKey) {
    return unauthorized();
  }

  try {
    const { id } = await params;
    const activation = await cancelExternalActivationRequest(apiKey, id);
    return json({ status: activation?.status || "not_found" });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "activation failed");
  }
}

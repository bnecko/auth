import { type NextRequest } from "next/server";
import { badRequest, json } from "@/lib/server/http";
import { findRegistrationRequest } from "@/lib/server/repositories/registrationRequests";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const request = await findRegistrationRequest(id);
  if (!request) {
    return badRequest("verification not found");
  }

  return json({
    status: request.status,
    expiresAt: request.expiresAt,
  });
}

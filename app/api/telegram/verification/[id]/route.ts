import { type NextRequest } from "next/server";
import { json } from "@/lib/server/http";
import { findRegistrationRequest } from "@/lib/server/repositories/registrationRequests";

export const runtime = "nodejs";

// This endpoint is unauthenticated and polled every couple of seconds by
// the in-progress registration page, so we deliberately never distinguish
// "no such id" from "id exists". Both return the same shape with status
// "unknown", which prevents a caller from confirming registration_request
// public-ids by enumeration.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const request = await findRegistrationRequest(id);
  if (!request) {
    return json({ status: "unknown", expiresAt: null });
  }

  return json({
    status: request.status,
    expiresAt: request.expiresAt,
  });
}

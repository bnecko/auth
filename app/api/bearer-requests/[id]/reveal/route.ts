import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { badRequest, json } from "@/lib/server/http";
import { revealBearerKey } from "@/lib/server/services/bearer";

export const runtime = "nodejs";

// Returns the plaintext bearer for an approved request that the user
// owns. The plaintext lives on the bearer_requests row only until the
// user explicitly dismisses it via DELETE /api/bearer-requests/:id; on
// dismissal only the sha256 hash on external_apps remains.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  try {
    const plaintext = await revealBearerKey(id, auth.session.user);
    if (!plaintext) {
      return badRequest("key is not available");
    }
    return json({ key: plaintext });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "reveal failed");
  }
}

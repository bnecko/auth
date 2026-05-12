import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { badRequest, json } from "@/lib/server/http";
import { revealBearerKey } from "@/lib/server/services/bearer";

export const runtime = "nodejs";

// Returns the plaintext bearer for an approved request that the user
// owns, exactly once. The same statement that returns the plaintext
// also clears it from the row, so a second POST to this endpoint will
// 400 even from the same authenticated user.
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
    const plaintext = await revealBearerKey(id, auth.session.user, req);
    if (!plaintext) {
      return badRequest("key is not available");
    }
    return json({ key: plaintext });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "reveal failed");
  }
}

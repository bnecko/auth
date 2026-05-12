import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { badRequest, json } from "@/lib/server/http";
import { dismissBearerKey } from "@/lib/server/services/bearer";

export const runtime = "nodejs";

// Permanently clears the plaintext bearer for an approved request. The
// external_apps row (and its sha256 hash) is preserved so the issued
// key keeps working; only the recoverable plaintext is destroyed.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  try {
    const cleared = await dismissBearerKey(id, auth.session.user, req);
    if (!cleared) {
      return badRequest("nothing to clear");
    }
    return json({ status: cleared.status });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "dismiss failed");
  }
}

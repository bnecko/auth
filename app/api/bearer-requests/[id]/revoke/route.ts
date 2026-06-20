import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { badRequest, json } from "@/lib/server/http";
import { requestBearerRevokeApproval } from "@/lib/server/services/bearer";

export const runtime = "nodejs";

// Starts a Telegram-confirmed revocation: the actual revoke happens when the
// creator taps Approve in Telegram. Returns a browserToken the page polls.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const { id } = await params;
  try {
    const { browserToken } = await requestBearerRevokeApproval({
      user: auth.session.user,
      bearerPublicId: id,
      req,
    });
    return json({ browserToken });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "could not start revoke");
  }
}

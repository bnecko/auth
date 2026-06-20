import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { badRequest, json, requestBody } from "@/lib/server/http";
import { requestAccountDeletion } from "@/lib/server/services/account";

export const runtime = "nodejs";

// Starts a Telegram-confirmed deletion: the soft delete is scheduled only when
// the user taps Approve in Telegram. Returns a browserToken the page polls.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const body = await requestBody(req);
  const currentPassword = typeof body.password === "string" ? body.password : "";
  if (!currentPassword) {
    return badRequest("enter your current password");
  }

  try {
    const { browserToken } = await requestAccountDeletion({
      user: auth.session.user,
      currentPassword,
      req,
    });
    return json({ browserToken });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "could not start deletion");
  }
}

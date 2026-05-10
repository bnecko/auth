import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { badRequest, json } from "@/lib/server/http";
import { setAccountStatusFromRequest } from "@/lib/server/services/admin";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const { id } = await params;
    await setAccountStatusFromRequest(Number(id), "active", auth.session.user, req);
    return json({ status: "active" });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "unban failed");
  }
}

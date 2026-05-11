import { type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/server/session";
import { verifyStepUpOtp, grantAdminStepUp } from "@/lib/server/adminStepUp";
import { json, requestBody } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.user.role !== "admin") {
    return json({ error: "forbidden" }, 403);
  }

  const body = await requestBody(req);
  const code = typeof body.code === "string" ? body.code : "";

  if (!code) {
    return json({ error: "code required" }, 400);
  }

  const ok = await verifyStepUpOtp(session.user.id, code);
  if (!ok) {
    return json({ error: "invalid or expired code" }, 400);
  }

  await grantAdminStepUp(session.user.id);
  return json({ ok: true });
}

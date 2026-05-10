import { type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/server/session";
import { getRelinkStatus } from "@/lib/server/relinkChallenge";
import { forbidden, json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return forbidden();

  const browserToken = req.nextUrl.searchParams.get("t") || "";
  if (!browserToken) {
    return json({ error: "missing token" }, 400);
  }

  const status = await getRelinkStatus(browserToken);
  if (!status) {
    return json({ status: "expired" });
  }

  return json({ status });
}

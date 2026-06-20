import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { json } from "@/lib/server/http";
import { getBearerRevokeStatus } from "@/lib/server/services/bearer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const browserToken = req.nextUrl.searchParams.get("t") || "";
  if (!browserToken) return json({ status: "expired" });

  const status = await getBearerRevokeStatus(browserToken);
  return json({ status: status || "expired" });
}

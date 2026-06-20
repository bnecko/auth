import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { json } from "@/lib/server/http";
import { getAccountDeleteStatus } from "@/lib/server/services/account";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const browserToken = req.nextUrl.searchParams.get("t") || "";
  if (!browserToken) return json({ status: "expired" });

  const status = await getAccountDeleteStatus(browserToken);
  return json({ status: status || "expired" });
}

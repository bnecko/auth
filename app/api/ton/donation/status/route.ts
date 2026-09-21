import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { cryptoEnabled } from "@/lib/server/config";
import { json, notFound } from "@/lib/server/http";
import { donatedTotalNano } from "@/lib/server/repositories/tonDonations";

export const runtime = "nodejs";

// Polled by the donate panel while a payment settles. Reads the caller's own
// totals only, so there is nothing here to rate limit beyond the session.
export async function GET(req: NextRequest) {
  const { response, session } = await requireUser(req);
  if (response) return response;
  if (!cryptoEnabled()) return notFound();

  return json({
    donor: Boolean(session.user.donorSince),
    totalNano: await donatedTotalNano(session.user.id),
  });
}

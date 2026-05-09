import { type NextRequest } from "next/server";
import { json } from "@/lib/server/http";
import { getTelegramLoginChallenge } from "@/lib/server/services/auth";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const challenge = await getTelegramLoginChallenge(id);
  if (!challenge) {
    return json({ status: "unknown", expiresAt: null });
  }

  return json(challenge);
}

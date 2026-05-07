import { NextResponse, type NextRequest } from "next/server";
import { badRequest } from "@/lib/server/http";
import { createUserSession } from "@/lib/server/session";
import { completeVerifiedRegistration } from "@/lib/server/services/auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const user = await completeVerifiedRegistration(id, req);
    const res = NextResponse.json({ redirectTo: "/" });
    await createUserSession(user.id, req, res);
    return res;
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "registration failed");
  }
}

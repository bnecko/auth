import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { badRequest } from "@/lib/server/http";
import { approveActivationForUser } from "@/lib/server/services/activation";

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
    const result = await approveActivationForUser(id, auth.session.user, req);
    return NextResponse.redirect(new URL(result.redirectTo, req.url));
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "activation failed");
  }
}

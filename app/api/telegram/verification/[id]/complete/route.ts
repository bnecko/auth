import { NextResponse, type NextRequest } from "next/server";
import { badRequest, json, requestBody, requestContext } from "@/lib/server/http";
import { createUserSession } from "@/lib/server/session";
import { completeVerifiedRegistration } from "@/lib/server/services/auth";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Bound email-code submissions per IP; the service caps wrong tries per code.
  const ip = requestContext(req).ip || "unknown";
  const rl = await rateLimit(`rl:register-email:ip:${ip}`, 20, 15 * 60 * 1000);
  if (!rl.success) {
    return json({ error: "Too many attempts. Please try again later." }, 429);
  }

  const body = await requestBody(req);
  const code = typeof body.code === "string" ? body.code : "";
  if (!/^\d{6}$/.test(code.trim())) {
    return badRequest("enter the 6-digit code");
  }

  try {
    const user = await completeVerifiedRegistration(id, code, req);
    const res = NextResponse.json({ redirectTo: "/account" });
    await createUserSession(user.id, req, res);
    return res;
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "registration failed");
  }
}

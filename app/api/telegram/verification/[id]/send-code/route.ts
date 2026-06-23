import { type NextRequest } from "next/server";
import { json, requestContext } from "@/lib/server/http";
import { sendRegistrationEmailCode } from "@/lib/server/services/auth";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

// Sends the registration email code for a verification request. Called by the
// /verify page once Telegram approval lands. The email address is never exposed
// to the client - it's resolved server-side from the request id.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = requestContext(req).ip || "unknown";
  const rl = await rateLimit(`rl:register-sendcode:ip:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.success) {
    return json({ error: "Too many requests. Please try again later." }, 429);
  }

  const { id } = await params;
  const res = await sendRegistrationEmailCode(id);
  if (res.throttled) {
    return json({ error: "Please wait a moment before requesting another code." }, 429);
  }
  return json({ sent: res.sent });
}

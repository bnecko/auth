import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { verifyRelinkOtp, createRelinkChallenge } from "@/lib/server/relinkChallenge";
import { json, requestBody } from "@/lib/server/http";
import { env } from "@/lib/server/config";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { response, session } = await requireUser(req);
  if (response) return response;

  const body = await requestBody(req);
  const code = typeof body.code === "string" ? body.code : "";

  if (!code) {
    return json({ error: "code is required" }, 400);
  }

  const valid = await verifyRelinkOtp(session.user.id, code);
  if (!valid) {
    return json({ error: "invalid or expired code" }, 400);
  }

  const { startToken, browserToken } = await createRelinkChallenge(session.user.id);
  const botUsername = env("TELEGRAM_BOT_USERNAME");
  const botUrl = `https://t.me/${botUsername}?start=${startToken}`;

  return json({ browserToken, botUrl });
}

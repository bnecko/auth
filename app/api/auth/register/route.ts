import { type NextRequest } from "next/server";
import { badRequest, json, requestBody } from "@/lib/server/http";
import { registerUser } from "@/lib/server/services/auth";
import { parseRegistrationInput } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await requestBody(req);
  const { input, errors } = parseRegistrationInput(body);
  if (Object.keys(errors).length > 0) {
    return json({ errors }, 400);
  }

  // Never create the account or a session from here. The Telegram approval and
  // the email code that follow are where a banned Telegram id and an address
  // the person does not own are turned away, so a shortcut past them, such as
  // trusting a signed Telegram payload in this body, would skip both checks.
  try {
    const result = await registerUser(input, req);
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || "bottleneck_auth_bot";
    return json(
      {
        verificationId: result.verificationId,
        expiresAt: result.expiresAt,
        botUrl: `https://t.me/${botUsername}?start=${result.startToken}`,
      },
      202,
    );
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "registration failed");
  }
}

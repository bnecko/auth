import { NextResponse, type NextRequest } from "next/server";
import { badRequest, json, requestBody } from "@/lib/server/http";
import { registerUser } from "@/lib/server/services/auth";
import { createUserSession } from "@/lib/server/session";
import { parseRegistrationInput } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await requestBody(req);
  const { input, errors } = parseRegistrationInput(body);
  if (Object.keys(errors).length > 0) {
    return json({ errors }, 400);
  }

  try {
    const telegram =
      typeof body.telegram === "object" && body.telegram
        ? (body.telegram as Record<string, string | number | undefined>)
        : undefined;
    const result = await registerUser(input, req, telegram);

    if (result.kind === "pending_telegram") {
      return json(
        {
          verificationId: result.verificationId,
          code: result.code,
          expiresAt: result.expiresAt,
          botUrl: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || "bottleneck_auth_bot"}?start=${result.code}`,
        },
        202,
      );
    }

    const res = NextResponse.json({ redirectTo: "/" }, { status: 201 });
    await createUserSession(result.user.id, req, res);
    return res;
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "registration failed");
  }
}

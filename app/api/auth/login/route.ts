import { NextResponse, type NextRequest } from "next/server";
import { badRequest, json, requestBody } from "@/lib/server/http";
import { loginUser } from "@/lib/server/services/auth";
import { createUserSession } from "@/lib/server/session";
import { parseLoginInput } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await requestBody(req);
  const { input, errors } = parseLoginInput(body);
  if (Object.keys(errors).length > 0) {
    return json({ errors }, 400);
  }

  try {
    const user = await loginUser(input, req);
    const res = NextResponse.json({ redirectTo: "/" });
    await createUserSession(user.id, req, res);
    return res;
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "login failed");
  }
}

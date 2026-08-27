import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { oauthUserInfo } from "@/lib/server/services/oauth";

export const runtime = "nodejs";

// OAuth-style envelope (stable `error` code plus `error_description`) rather
// than the generic unauthorized() helper: the SDK surfaces `error` as
// BottleneckAuthError.code, which is documented as a machine code to branch
// on, so prose must not end up there.
function unauthorized(code: "invalid_request" | "invalid_token", description: string) {
  return NextResponse.json(
    { error: code, error_description: description },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return unauthorized("invalid_request", "missing bearer token");
  }

  const profile = await oauthUserInfo(token);
  if (!profile) {
    return unauthorized("invalid_token", "invalid bearer token");
  }

  return NextResponse.json(profile, {
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

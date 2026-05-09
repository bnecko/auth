import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requestBody } from "@/lib/server/http";
import {
  introspectOAuthToken,
  OAuthError,
} from "@/lib/server/services/oauth";

export const runtime = "nodejs";

function tokenJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await requestBody(req);
    const result = await introspectOAuthToken(body, req);
    return tokenJson(result);
  } catch (err) {
    if (err instanceof OAuthError) {
      return tokenJson(
        {
          error: err.code,
          error_description: err.message,
        },
        err.status,
      );
    }

    return tokenJson(
      {
        error: "server_error",
        error_description: "introspection failed",
      },
      500,
    );
  }
}

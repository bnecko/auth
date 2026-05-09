import { NextResponse, type NextRequest } from "next/server";
import { revokeOAuthToken, OAuthError } from "@/lib/server/services/oauth";
import { requestBody } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await requestBody(req);
    await revokeOAuthToken(body, req);
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    if (err instanceof OAuthError) {
      return NextResponse.json(
        {
          error: err.code,
          error_description: err.message,
        },
        {
          status: err.status,
          headers: {
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        },
      );
    }

    return NextResponse.json(
      {
        error: "server_error",
        error_description: "token revocation failed",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      },
    );
  }
}

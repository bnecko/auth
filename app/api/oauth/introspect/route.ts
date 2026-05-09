import { type NextRequest } from "next/server";
import { json, requestBody } from "@/lib/server/http";
import {
  introspectOAuthToken,
  OAuthError,
} from "@/lib/server/services/oauth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await requestBody(req);
    const result = await introspectOAuthToken(body, req);
    return json(result);
  } catch (err) {
    if (err instanceof OAuthError) {
      return json(
        {
          error: err.code,
          error_description: err.message,
        },
        err.status,
      );
    }

    return json(
      {
        error: "server_error",
        error_description: "introspection failed",
      },
      500,
    );
  }
}

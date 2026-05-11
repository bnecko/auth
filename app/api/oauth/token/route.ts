import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requestBody, requestContext } from "@/lib/server/http";
import { exchangeOAuthToken, OAuthError } from "@/lib/server/services/oauth";
import { rateLimit } from "@/lib/server/rateLimit";

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
    const ip = requestContext(req).ip || "unknown";
    const rl = await rateLimit(`rl:oauth:token:ip:${ip}`, 300, 60000);
    if (!rl.success) {
      return tokenJson(
        { error: "slow_down", error_description: "too many requests" },
        429
      );
    }

    const body = await requestBody(req);
    
    if (body.grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
      const rlDevice = await rateLimit(`rl:oauth:device_poll:ip:${ip}`, 5, 5000);
      if (!rlDevice.success) {
        return tokenJson(
          { error: "slow_down", error_description: "polling too fast" },
          400
        );
      }
    }

    const result = await exchangeOAuthToken(body, req);
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
        error_description: "token exchange failed",
      },
      500,
    );
  }
}

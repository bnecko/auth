import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requestBody, badRequest } from "@/lib/server/http";
import { authenticateClient } from "@/lib/server/services/oauth";
import { createPushedRequest } from "@/lib/server/repositories/oauth";

export const runtime = "nodejs";

function generateRequestUri() {
  return `urn:ietf:params:oauth:request_uri:${randomBytes(32).toString("hex")}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await requestBody(req);
    
    const app = await authenticateClient(req, body);
    if (!app) {
      return NextResponse.json({ error: "invalid_client" }, { status: 401 });
    }

    const scopes = typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [];
    const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
    const state = typeof body.state === "string" ? body.state : null;
    const codeChallenge = typeof body.code_challenge === "string" ? body.code_challenge : null;
    const codeChallengeMethod = typeof body.code_challenge_method === "string" ? body.code_challenge_method : null;
    const nonce = typeof body.nonce === "string" ? body.nonce : null;

    if (!redirectUri) {
      return NextResponse.json({ error: "invalid_request", error_description: "redirect_uri is required" }, { status: 400 });
    }

    if (!app.allowedRedirectUrls.includes(redirectUri)) {
      return NextResponse.json({ error: "invalid_request", error_description: "redirect_uri not allowed" }, { status: 400 });
    }

    const requestUri = generateRequestUri();
    const expiresIn = 60;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await createPushedRequest({
      requestUri,
      appId: app.id,
      scopes,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      nonce,
      expiresAt,
    });

    return NextResponse.json({
      request_uri: requestUri,
      expires_in: expiresIn,
    }, {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache"
      }
    });

  } catch (err: any) {
    if (err.code === "invalid_client") {
      return NextResponse.json({ error: "invalid_client" }, { status: 401 });
    }
    return badRequest("PAR request failed");
  }
}

import { NextResponse, type NextRequest } from "next/server";
import {
  findOAuthClientRegistrationRequestForToken,
  revealOAuthClientRegistrationSecret,
} from "@/lib/server/repositories/oauthClientRegistrations";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const request = await findOAuthClientRegistrationRequestForToken(clientId, token);
  if (!request) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body: Record<string, unknown> = {
    client_id: request.publicId,
    client_name: request.clientName,
    redirect_uris: request.redirectUris,
    grant_types: request.grantTypes,
    response_types: ["code"],
    token_endpoint_auth_method: request.tokenEndpointAuthMethod,
    oauth_profile_version: request.oauthProfileVersion,
    scope: request.scopes.join(" "),
    registration_status: request.status,
  };

  if (request.status === "approved") {
    const secret = await revealOAuthClientRegistrationSecret({
      publicId: clientId,
      registrationToken: token,
    });
    if (secret) {
      body.client_secret = secret;
    }
  }

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

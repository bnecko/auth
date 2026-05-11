import { type NextRequest, NextResponse } from "next/server";
import { requestBody, badRequest, requestContext } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { randomToken, safeEqual } from "@/lib/server/crypto";
import {
  currentOAuthProfileVersion,
  oauthDynamicRegistrationToken,
  supportedOAuthProfileVersion,
} from "@/lib/server/config";
import { OAuthError, parseOAuthScopes } from "@/lib/server/services/oauth";
import { createOAuthClientRegistrationRequest } from "@/lib/server/repositories/oauthClientRegistrations";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { assessRequestRisk } from "@/lib/server/risk";

export const runtime = "nodejs";

function generateClientId() {
  return `app_${randomToken(16)}`;
}

const supportedGrants = new Set([
  "authorization_code",
  "refresh_token",
  "client_credentials",
  "urn:ietf:params:oauth:grant-type:device_code",
]);
const supportedAuthMethods = [
  "client_secret_basic",
  "client_secret_post",
  "none",
] as const;

type TokenEndpointAuthMethod = (typeof supportedAuthMethods)[number];

function requestedStringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter(item => typeof item === "string").map(item => item.trim()).filter(Boolean)))
    : [];
}

export async function POST(req: NextRequest) {
  try {
    const registrationToken = oauthDynamicRegistrationToken();
    const auth = req.headers.get("authorization") || "";
    const suppliedToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!registrationToken || !suppliedToken || !safeEqual(suppliedToken, registrationToken)) {
      return NextResponse.json({ error: "access_denied", error_description: "dynamic client registration is restricted" }, { status: 403 });
    }

    const context = requestContext(req);
    const ip = context.ip || "unknown";

    const rl = await rateLimit(`rl:oauth:register:ip:${ip}`, 5, 3600000);
    if (!rl.success) {
      return NextResponse.json({ error: "slow_down", error_description: "too many registrations from this IP" }, { status: 429 });
    }

    const body = await requestBody(req);

    const clientName = typeof body.client_name === "string" ? body.client_name.trim() : null;
    const redirectUris = requestedStringArray(body.redirect_uris);
    const grantTypes = requestedStringArray(body.grant_types);
    const allowedGrantTypes = grantTypes.length > 0 ? grantTypes : ["authorization_code", "refresh_token"];
    const unknownGrant = allowedGrantTypes.find(grant => !supportedGrants.has(grant));
    const tokenEndpointAuthMethod =
      typeof body.token_endpoint_auth_method === "string"
        ? body.token_endpoint_auth_method
        : "client_secret_post";
    const clientType = tokenEndpointAuthMethod === "none" ? "public" : "confidential";
    const scopes = parseOAuthScopes(typeof body.scope === "string" ? body.scope : "openid profile email");
    const oauthProfileVersion =
      typeof body.oauth_profile_version === "string"
        ? body.oauth_profile_version
        : currentOAuthProfileVersion;

    if (!clientName) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "client_name is required" }, { status: 400 });
    }
    if (clientName.length > 80) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "client_name is too long" }, { status: 400 });
    }

    if (redirectUris.length === 0 || redirectUris.length > 10) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "redirect_uris must contain at least one valid URI" }, { status: 400 });
    }

    if (unknownGrant) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: `unsupported grant_type: ${unknownGrant}` }, { status: 400 });
    }

    if (!supportedAuthMethods.includes(tokenEndpointAuthMethod as TokenEndpointAuthMethod)) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "unsupported token_endpoint_auth_method" }, { status: 400 });
    }
    const supportedTokenEndpointAuthMethod = tokenEndpointAuthMethod as TokenEndpointAuthMethod;

    if (clientType === "public" && allowedGrantTypes.includes("client_credentials")) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "public clients cannot use client_credentials" }, { status: 400 });
    }

    if (!supportedOAuthProfileVersion(oauthProfileVersion)) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "unsupported oauth_profile_version" }, { status: 400 });
    }

    for (const uri of redirectUris) {
      try {
        const parsed = new URL(uri);
        if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
          return NextResponse.json({ error: "invalid_client_metadata", error_description: "redirect_uris must be https unless localhost" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "invalid_client_metadata", error_description: "invalid redirect_uri format" }, { status: 400 });
      }
    }

    const clientId = generateClientId();
    const registrationAccessToken = `reg_${randomToken(32)}`;
    const request = await createOAuthClientRegistrationRequest({
      publicId: clientId,
      registrationToken: registrationAccessToken,
      clientName,
      redirectUris,
      grantTypes: allowedGrantTypes,
      scopes,
      tokenEndpointAuthMethod: supportedTokenEndpointAuthMethod,
      clientType,
      oauthProfileVersion,
      requesterIp: context.ip,
      requesterUserAgent: context.userAgent,
      requesterCountry: context.country,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await recordSecurityEvent({
      eventType: "oauth_client_registration",
      result: "pending_review",
      context,
      metadata: {
        requestId: request.publicId,
        clientId,
        clientName,
        grantTypes: allowedGrantTypes,
        scopes,
        oauthProfileVersion,
      },
    });
    await assessRequestRisk({
      eventType: "oauth_client_registration",
      context,
      metadata: { requestId: request.publicId, clientId },
    });

    return NextResponse.json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: allowedGrantTypes,
      response_types: ["code"],
      token_endpoint_auth_method: supportedTokenEndpointAuthMethod,
      oauth_profile_version: oauthProfileVersion,
      scope: scopes.join(" "),
      registration_client_uri: `${req.nextUrl.origin}/api/oauth/register/${clientId}`,
      registration_access_token: registrationAccessToken,
      registration_status: "pending_review",
    }, {
      status: 202,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache"
      }
    });

  } catch (err) {
    if (err instanceof OAuthError) {
      return NextResponse.json({ error: err.code, error_description: err.message }, { status: err.status });
    }
    return badRequest("Client registration failed");
  }
}

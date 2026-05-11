import { type NextRequest, NextResponse } from "next/server";
import { requestBody, badRequest, requestContext } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { queryOne } from "@/lib/server/db";
import { hashToken, randomToken, safeEqual } from "@/lib/server/crypto";
import { oauthDynamicRegistrationToken } from "@/lib/server/config";
import { parseOAuthScopes } from "@/lib/server/services/oauth";

export const runtime = "nodejs";

function generateClientId() {
  return `app_${randomToken(16)}`;
}

function generateClientSecret() {
  return `sec_${randomToken(32)}`;
}

const supportedGrants = new Set([
  "authorization_code",
  "refresh_token",
  "client_credentials",
  "urn:ietf:params:oauth:grant-type:device_code",
]);

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

    const ip = requestContext(req).ip || "unknown";
    
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

    if (!["client_secret_basic", "client_secret_post", "none"].includes(tokenEndpointAuthMethod)) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "unsupported token_endpoint_auth_method" }, { status: 400 });
    }

    if (clientType === "public" && allowedGrantTypes.includes("client_credentials")) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "public clients cannot use client_credentials" }, { status: 400 });
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
    const clientSecret = clientType === "confidential" ? generateClientSecret() : null;
    const apiKey = clientSecret || generateClientSecret();
    const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + randomToken(4);

    const row = await queryOne<{ id: string }>(
      `insert into external_apps (
        public_id,
        name,
        slug,
        api_key_hash,
        oauth_client_secret_hash,
        allowed_redirect_urls,
        client_type,
        token_endpoint_auth_method,
        allowed_grant_types,
        allowed_scopes,
        issue_refresh_tokens,
        status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active') returning id`,
      [
        clientId,
        clientName,
        slug,
        hashToken(apiKey),
        clientSecret ? hashToken(clientSecret) : null,
        redirectUris,
        clientType,
        tokenEndpointAuthMethod,
        allowedGrantTypes,
        scopes,
        allowedGrantTypes.includes("refresh_token"),
      ]
    );

    if (!row) {
      throw new Error("Failed to insert client");
    }

    return NextResponse.json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: allowedGrantTypes,
      response_types: ["code"],
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      scope: scopes.join(" "),
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    }, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache"
      }
    });

  } catch (err: any) {
    return badRequest("Client registration failed");
  }
}

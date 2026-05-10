import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requestBody, badRequest } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { queryOne } from "@/lib/server/db";
import { hashToken, randomToken } from "@/lib/server/crypto";

export const runtime = "nodejs";

function generateClientId() {
  return `app_${randomToken(16)}`;
}

function generateClientSecret() {
  return `sec_${randomToken(32)}`;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
    
    // STRICT RATE LIMITING: max 5 registrations per hour per IP
    const rl = await rateLimit(`rl:oauth:register:ip:${ip}`, 5, 3600000);
    if (!rl.success) {
      return NextResponse.json({ error: "slow_down", error_description: "too many registrations from this IP" }, { status: 429 });
    }

    const body = await requestBody(req);
    
    const clientName = typeof body.client_name === "string" ? body.client_name.trim() : null;
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter(u => typeof u === "string") : [];
    
    if (!clientName) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "client_name is required" }, { status: 400 });
    }

    if (redirectUris.length === 0) {
      return NextResponse.json({ error: "invalid_client_metadata", error_description: "redirect_uris must contain at least one valid URI" }, { status: 400 });
    }

    // Validate URIs
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
    const clientSecret = generateClientSecret();
    const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + randomToken(4);

    const row = await queryOne<{ id: string }>(
      `insert into external_apps (
        public_id, name, slug, api_key_hash, allowed_redirect_urls, status
      ) values ($1, $2, $3, $4, $5, 'active') returning id`,
      [clientId, clientName, slug, hashToken(clientSecret), redirectUris]
    );

    if (!row) {
      throw new Error("Failed to insert client");
    }

    return NextResponse.json({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token", "client_credentials", "urn:ietf:params:oauth:grant-type:device_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post"
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

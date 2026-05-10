import { type NextRequest, NextResponse } from "next/server";
import { randomBytes, randomInt } from "crypto";
import { requestBody, badRequest } from "@/lib/server/http";
import { authenticateClient } from "@/lib/server/services/oauth";
import { createDeviceCode } from "@/lib/server/repositories/oauth";
import { authBaseUrl } from "@/lib/server/config";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

function generateUserCode() {
  const chars = "BCDFGHJKLMNPQRSTVWXZ";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[randomInt(0, chars.length)];
    if (i === 3) result += "-";
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
    const rl = await rateLimit(`rl:oauth:device:code:ip:${ip}`, 50, 60000);
    if (!rl.success) {
      return NextResponse.json({ error: "slow_down", error_description: "too many requests" }, { status: 429 });
    }

    const body = await requestBody(req);
    
    const app = await authenticateClient(req, body);
    if (!app) {
      return NextResponse.json({ error: "invalid_client" }, { status: 401 });
    }

    const scopes = typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : ["profile:read"];
    
    const deviceCode = randomBytes(32).toString("hex");
    const userCode = generateUserCode();
    const expiresIn = 600; // 10 minutes
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await createDeviceCode({
      deviceCode,
      userCode,
      appId: app.id,
      scopes,
      expiresAt,
    });

    const verificationUri = `${authBaseUrl()}/device`;

    return NextResponse.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?user_code=${userCode}`,
      expires_in: expiresIn,
      interval: 5,
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
    return badRequest("Device code generation failed");
  }
}

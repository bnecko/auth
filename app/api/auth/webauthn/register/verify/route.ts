import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getSessionFromRequest } from "@/lib/server/session";
import { createWebauthnCredential } from "@/lib/server/repositories/webauthn";
import { getRpID, getOrigin } from "@/lib/server/webauthn";
import redis from "@/lib/server/redis";
import { json, requestBody } from "@/lib/server/http";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return json({ error: "unauthorized" }, 401);
    }
    const body = await requestBody(req);
    const expectedChallenge = await redis.get(`webauthn:challenge:${session.user.id}`);

    if (!expectedChallenge) {
      return json({ error: "challenge expired or not found" }, 400);
    }

    const verification = await verifyRegistrationResponse({
      response: body as any,
      expectedChallenge,
      expectedOrigin: getOrigin(),
      expectedRPID: getRpID(),
      requireUserVerification: false,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType } = verification.registrationInfo;

      const newCredential = await createWebauthnCredential({
        userId: session.user.id,
        credentialId: credential.id,
        publicKey: credential.publicKey,
        signCount: 0,
        transports: (body as any).response?.transports || [],
        name: (body as any).name || credentialDeviceType,
      });

      await redis.del(`webauthn:challenge:${session.user.id}`);

      const ip = req.headers.get("x-forwarded-for") || "unknown";
      await recordSecurityEvent({
        userId: session.user.id,
        eventType: "webauthn_registered",
        result: "ok",
        context: { ip, userAgent: req.headers.get("user-agent") || "unknown", country: "" },
        metadata: { credentialId: credential.id },
      });

      return NextResponse.json({ success: true, credential: newCredential });
    }

    return json({ error: "verification failed" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "verification failed" }, 400);
  }
}

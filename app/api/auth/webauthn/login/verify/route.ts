import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { findWebauthnCredentialById, updateWebauthnCredentialSignCount } from "@/lib/server/repositories/webauthn";
import { getRpID, getOrigin } from "@/lib/server/webauthn";
import redis from "@/lib/server/redis";
import { json, requestBody } from "@/lib/server/http";
import { createUserSession } from "@/lib/server/session";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { findUserById } from "@/lib/server/repositories/users";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await requestBody(req);
    const { response, challengeId } = body as any;

    if (!response || !challengeId) {
      return json({ error: "missing response or challengeId" }, 400);
    }

    const expectedChallenge = await redis.get(`webauthn:auth_challenge:${challengeId}`);
    if (!expectedChallenge) {
      return json({ error: "challenge expired or not found" }, 400);
    }

    const credential = await findWebauthnCredentialById(response.id);
    if (!credential) {
      return json({ error: "credential not found" }, 400);
    }
    const user = await findUserById(credential.userId);
    if (!user || user.status === "banned") {
      return json({ error: "credential not found" }, 400);
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: getOrigin(),
        expectedRPID: getRpID(),
        requireUserVerification: user.role === "admin",
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.publicKey),
          counter: credential.signCount,
          transports: credential.transports as any,
        },
      });
    } catch (verifyErr) {
      console.error("[webauthn/login/verify] verifyAuthenticationResponse threw:", verifyErr);
      return json({ error: verifyErr instanceof Error ? verifyErr.message : "verification failed" }, 400);
    }

    if (verification.verified && verification.authenticationInfo) {
      await updateWebauthnCredentialSignCount(credential.credentialId, verification.authenticationInfo.newCounter);
      await redis.del(`webauthn:auth_challenge:${challengeId}`);

      const ip = req.headers.get("x-forwarded-for") || "unknown";
      await recordSecurityEvent({
        userId: credential.userId,
        eventType: "webauthn_login",
        result: "ok",
        context: { ip, userAgent: req.headers.get("user-agent") || "unknown", country: "" },
        metadata: { credentialId: credential.credentialId },
      });

      const res = NextResponse.json({ success: true, redirectTo: "/" });
      await createUserSession(user.id, req, res, { remember: true });
      return res;
    }

    return json({ error: "verification failed" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "verification failed" }, 400);
  }
}

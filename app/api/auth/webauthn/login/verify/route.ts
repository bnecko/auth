import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { findWebauthnCredentialById, updateWebauthnCredentialSignCount } from "@/lib/server/repositories/webauthn";
import { getRpID, getOrigin } from "@/lib/server/webauthn";
import redis from "@/lib/server/redis";
import { json, requestBody, requestContext, requestId } from "@/lib/server/http";
import { createUserSession } from "@/lib/server/session";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { findUserById } from "@/lib/server/repositories/users";
import { notifyUser } from "@/lib/server/notifications";
import { log } from "@/lib/server/log";

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
      log.error("webauthn_verify_threw", { requestId: requestId(req), error: verifyErr });
      await recordSecurityEvent({
        userId: credential.userId,
        eventType: "webauthn_login",
        result: "verification_failed",
        context: requestContext(req),
        metadata: {
          credentialId: credential.credentialId,
          error: verifyErr instanceof Error ? verifyErr.message : "unknown",
        },
      });
      // Generic to the client; the library error is in the log + event only.
      return json({ error: "verification failed" }, 400);
    }

    if (verification.verified && verification.authenticationInfo) {
      await updateWebauthnCredentialSignCount(credential.credentialId, verification.authenticationInfo.newCounter);
      await redis.del(`webauthn:auth_challenge:${challengeId}`);

      await recordSecurityEvent({
        userId: credential.userId,
        eventType: "webauthn_login",
        result: "ok",
        context: requestContext(req),
        metadata: { credentialId: credential.credentialId },
      });

      // Passkey logins have no Telegram step, so they are the one sign-in path
      // that otherwise leaves no trace. Best-effort alert, gated by the user's
      // notify_signin_alerts preference (notifyUser never throws).
      await notifyUser(user.id, {
        type: "signin_alert",
        method: "passkey",
        ip: requestContext(req).ip || undefined,
      });

      const res = NextResponse.json({ success: true, redirectTo: "/" });
      await createUserSession(user.id, req, res, { remember: true });
      return res;
    }

    await recordSecurityEvent({
      userId: credential.userId,
      eventType: "webauthn_login",
      result: "verification_failed",
      context: requestContext(req),
      metadata: { credentialId: credential.credentialId },
    });
    return json({ error: "verification failed" }, 400);
  } catch (err) {
    log.error("webauthn_login_error", { requestId: requestId(req), error: err });
    return json({ error: "verification failed" }, 400);
  }
}

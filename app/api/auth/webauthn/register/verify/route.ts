import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { requireUser } from "@/lib/server/apiAuth";
import {
  createWebauthnCredential,
  findWebauthnCredentialsByUser,
  MAX_PASSKEY_NAME_LENGTH,
  MAX_PASSKEYS_PER_USER,
} from "@/lib/server/repositories/webauthn";
import { notifyUser } from "@/lib/server/notifications";
import { getRpID, getOrigin } from "@/lib/server/webauthn";
import redis from "@/lib/server/redis";
import { json, requestBody, requestContext, requestId } from "@/lib/server/http";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { log } from "@/lib/server/log";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { response, session } = await requireUser(req);
    if (response) {
      return response;
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
      requireUserVerification: session.user.role === "admin",
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType } = verification.registrationInfo;
      if ((await findWebauthnCredentialsByUser(session.user.id)).length >= MAX_PASSKEYS_PER_USER) {
        return json({ error: `You can have up to ${MAX_PASSKEYS_PER_USER} passkeys. Remove one first.` }, 400);
      }
      const requestedName = typeof (body as any).name === "string" ? (body as any).name.trim() : "";

      const newCredential = await createWebauthnCredential({
        userId: session.user.id,
        credentialId: credential.id,
        publicKey: credential.publicKey,
        signCount: 0,
        transports: (body as any).response?.transports || [],
        name: requestedName.slice(0, MAX_PASSKEY_NAME_LENGTH) || credentialDeviceType,
      });

      await redis.del(`webauthn:challenge:${session.user.id}`);

      await recordSecurityEvent({
        userId: session.user.id,
        eventType: "webauthn_registered",
        result: "ok",
        context: requestContext(req),
        metadata: { credentialId: credential.id },
      });
      // A new way to sign in is something the owner should hear about from us,
      // not find later in a list.
      await notifyUser(session.user.id, { type: "passkey_added" });

      return NextResponse.json({ success: true, credential: newCredential });
    }

    return json({ error: "verification failed" }, 400);
  } catch (err) {
    log.error("webauthn_register_error", { requestId: requestId(req), error: err });
    return json({ error: "verification failed" }, 400);
  }
}

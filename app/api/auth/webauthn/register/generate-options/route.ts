import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions, type AuthenticatorTransport } from "@simplewebauthn/server";
import { getSessionFromRequest } from "@/lib/server/session";
import { findWebauthnCredentialsByUser } from "@/lib/server/repositories/webauthn";
import { getRpID, rpName } from "@/lib/server/webauthn";
import redis from "@/lib/server/redis";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return json({ error: "unauthorized" }, 401);
    }
    const userCredentials = await findWebauthnCredentialsByUser(session.user.id);

    const options = await generateRegistrationOptions({
      rpName,
      rpID: getRpID(),
      userID: new Uint8Array(Buffer.from(session.user.id.toString())),
      userName: session.user.username,
      // Don't prompt users for their own authenticators if they've already registered them
      excludeCredentials: userCredentials.map(cred => ({
        id: cred.credentialId,
        type: 'public-key',
        transports: cred.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await redis.setex(`webauthn:challenge:${session.user.id}`, 300, options.challenge);

    return NextResponse.json(options);
  } catch (err) {
    return json({ error: "failed to generate options" }, 500);
  }
}

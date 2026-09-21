import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions, type AuthenticatorTransport } from "@simplewebauthn/server";
import { requireUser } from "@/lib/server/apiAuth";
import { findWebauthnCredentialsByUser, MAX_PASSKEYS_PER_USER } from "@/lib/server/repositories/webauthn";
import { getRpID, rpName } from "@/lib/server/webauthn";
import redis from "@/lib/server/redis";
import { forbidden, json, requestBody, requestContext, tooManyRequests } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { isCurrentPassword } from "@/lib/server/reauth";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";

export const runtime = "nodejs";

const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

// A passkey signs in without the password and without the Telegram step, and
// nothing but the owner removing it takes it away. Adding one on a session
// alone let anyone holding a stolen cookie, or a minute at an unlocked browser,
// leave with a credential that outlived the password change meant to evict
// them. The password is asked for here rather than at verify: a passkey can
// only be registered against a challenge issued here, and the challenge goes
// only to whoever asked, so this is the gate, and a mistyped password costs the
// user no authenticator prompt. A POST, because a password does not belong in a
// query string.
export async function POST(req: NextRequest) {
  try {
    const { response, session } = await requireUser(req);
    if (response) {
      return response;
    }

    const limit = await rateLimit(`rl:passkey:enroll:user:${session.user.id}`, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS);
    if (!limit.success) return tooManyRequests("Too many attempts. Wait a few minutes.");

    const body = await requestBody(req);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (!(await isCurrentPassword(session.user.id, currentPassword))) {
      await recordSecurityEvent({
        userId: session.user.id,
        eventType: "webauthn_registered",
        result: "invalid_password",
        context: requestContext(req),
      });
      return forbidden("Current password is incorrect.");
    }

    const userCredentials = await findWebauthnCredentialsByUser(session.user.id);
    if (userCredentials.length >= MAX_PASSKEYS_PER_USER) {
      return json({ error: `You can have up to ${MAX_PASSKEYS_PER_USER} passkeys. Remove one first.` }, 400);
    }

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

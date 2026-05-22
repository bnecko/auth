import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getRpID } from "@/lib/server/webauthn";
import redis from "@/lib/server/redis";
import { randomToken } from "@/lib/server/crypto";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const options = await generateAuthenticationOptions({
      rpID: getRpID(),
      userVerification: 'preferred',
    });

    // No user session exists at authentication time, so the challenge is keyed by a
    // random id that the client echoes back on verify rather than by IP or user id.
    // Math.random is not cryptographically secure and can collide; use a CSPRNG.
    const challengeId = randomToken(16);
    await redis.setex(`webauthn:auth_challenge:${challengeId}`, 300, options.challenge);

    return NextResponse.json({ options, challengeId });
  } catch (err) {
    return json({ error: "failed to generate options" }, 500);
  }
}

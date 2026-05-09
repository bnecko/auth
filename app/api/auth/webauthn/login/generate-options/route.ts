import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getRpID } from "@/lib/server/webauthn";
import redis from "@/lib/server/redis";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const options = await generateAuthenticationOptions({
      rpID: getRpID(),
      userVerification: 'preferred',
    });

    // Store the challenge in redis associated with the current browser session IP or a cookie
    // To be safe without a session, we'll store it by IP, but standard practice is a temporary cookie token.
    // For simplicity, we can pass a 'challengeId' back to the client and have them submit it with the response.
    const challengeId = Math.random().toString(36).substring(2, 15);
    await redis.setex(`webauthn:auth_challenge:${challengeId}`, 300, options.challenge);

    return NextResponse.json({ options, challengeId });
  } catch (err) {
    return json({ error: "failed to generate options" }, 500);
  }
}

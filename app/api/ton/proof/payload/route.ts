import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { cryptoEnabled } from "@/lib/server/config";
import { json, notFound, tooManyRequests, requestContext } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { createTonProofNonce } from "@/lib/server/ton/proofChallenge";

export const runtime = "nodejs";

// A nonce per connect attempt, and users retry connects: too tight a limit
// breaks a user switching wallets, too loose lets someone farm challenges.
const USER_LIMIT = 10;
const USER_WINDOW_MS = 10 * 60 * 1000;

const IP_LIMIT = 30;
const IP_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { response, session } = await requireUser(req);
  if (response) return response;
  if (!cryptoEnabled()) return notFound();

  const ctx = requestContext(req);
  const [byUser, byIp] = await Promise.all([
    rateLimit(`rl:tonproof:payload:user:${session.user.id}`, USER_LIMIT, USER_WINDOW_MS),
    rateLimit(`rl:tonproof:payload:ip:${ctx.ip || "unknown"}`, IP_LIMIT, IP_WINDOW_MS),
  ]);

  if (!byUser.success) {
    return tooManyRequests("Too many wallet connection attempts. Wait a few minutes.");
  }
  if (!byIp.success) {
    return tooManyRequests("Too many requests from this network. Try again later.");
  }

  return json({ payload: await createTonProofNonce(session.user.id) });
}

import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { authBaseUrl, cryptoEnabled } from "@/lib/server/config";
import { badRequest, json, notFound, requestBody, requestContext, tooManyRequests } from "@/lib/server/http";
import { notifyUser } from "@/lib/server/notifications";
import { rateLimit } from "@/lib/server/rateLimit";
import { recordSecurityEvent } from "@/lib/server/repositories/securityEvents";
import { linkTonWallet } from "@/lib/server/repositories/tonWallets";
import { consumeTonProofNonce } from "@/lib/server/ton/proofChallenge";
import { verifyTonProof, type TonProofInput, type TonProofReason } from "@/lib/server/ton/proof";

export const runtime = "nodejs";

const USER_LIMIT = 10;
const USER_WINDOW_MS = 10 * 60 * 1000;

const IP_LIMIT = 30;
const IP_WINDOW_MS = 60 * 60 * 1000;

// Narrows the untrusted body to the shape the verifier's types promise. It
// only decides that the fields are present and of the right kind; every
// judgement about whether they are trustworthy belongs to verifyTonProof.
function parseProofBody(body: Record<string, unknown>): TonProofInput | null {
  const proof = body.proof as Record<string, unknown> | undefined;
  const domain = proof?.domain as Record<string, unknown> | undefined;

  if (
    typeof body.address !== "string" ||
    typeof body.network !== "string" ||
    typeof body.walletStateInit !== "string" ||
    typeof proof?.timestamp !== "number" ||
    typeof proof.payload !== "string" ||
    typeof proof.signature !== "string" ||
    typeof domain?.value !== "string" ||
    typeof domain.lengthBytes !== "number"
  ) {
    return null;
  }

  return {
    address: body.address,
    network: body.network,
    walletStateInit: body.walletStateInit,
    proof: {
      timestamp: proof.timestamp,
      domain: { lengthBytes: domain.lengthBytes, value: domain.value },
      payload: proof.payload,
      signature: proof.signature,
    },
  };
}

function rejectionMessage(reason: TonProofReason): string {
  switch (reason) {
    case "network":
      return "That wallet is on a test network. Switch it to mainnet and try again.";
    case "timestamp":
      return "That signature has expired. Try connecting again.";
    case "unknown_wallet":
      return "That wallet version is not supported yet. Tonkeeper, MyTonWallet, Telegram Wallet and Tonhub all work.";
    case "domain":
      return "That signature was made for a different site.";
    default:
      return "Could not verify that wallet. Try connecting again.";
  }
}

export async function POST(req: NextRequest) {
  const { response, session } = await requireUser(req);
  if (response) return response;
  if (!cryptoEnabled()) return notFound();

  const { user } = session;
  const ctx = requestContext(req);

  const [byUser, byIp] = await Promise.all([
    rateLimit(`rl:tonproof:verify:user:${user.id}`, USER_LIMIT, USER_WINDOW_MS),
    rateLimit(`rl:tonproof:verify:ip:${ctx.ip || "unknown"}`, IP_LIMIT, IP_WINDOW_MS),
  ]);
  if (!byUser.success) {
    return tooManyRequests("Too many verification attempts. Wait a few minutes.");
  }
  if (!byIp.success) {
    return tooManyRequests("Too many requests from this network. Try again later.");
  }

  const input = parseProofBody(await requestBody(req));
  if (!input) return badRequest("Malformed proof.");

  // Taken before anything is parsed and gone whether or not the rest succeeds,
  // so a rejected proof cannot be retried against a challenge that is still
  // live. Its presence is also what proves this payload was issued to this
  // user rather than collected somewhere else.
  const expectedPayload = await consumeTonProofNonce(user.id);
  if (!expectedPayload) {
    return badRequest("That connection attempt expired. Start again.");
  }

  const result = verifyTonProof(input, {
    expectedDomain: new URL(authBaseUrl()).host,
    expectedPayload,
  });

  if (!result.ok) {
    await recordSecurityEvent({
      userId: user.id,
      eventType: "ton_proof_failed",
      result: result.reason,
      context: ctx,
      // Recorded so an unsupported wallet shows up as demand rather than as a
      // user who silently gave up.
      metadata: result.codeHash ? { codeHash: result.codeHash } : undefined,
    });
    return badRequest(rejectionMessage(result.reason));
  }

  const linked = await linkTonWallet({
    userId: user.id,
    address: result.address,
    walletVersion: result.walletVersion,
  });
  if (!linked.ok) {
    return json({ error: "That wallet was claimed elsewhere a moment ago. Try again." }, 409);
  }

  await recordSecurityEvent({
    userId: user.id,
    eventType: "ton_wallet_linked",
    result: result.walletVersion,
    context: ctx,
    metadata: { address: result.address },
  });
  await notifyUser(user.id, { type: "ton_wallet_linked" });

  if (linked.displacedUserId) {
    await recordSecurityEvent({
      userId: linked.displacedUserId,
      eventType: "ton_wallet_unlinked",
      result: "claimed_elsewhere",
      context: ctx,
      metadata: { address: result.address },
    });
    await notifyUser(linked.displacedUserId, { type: "ton_wallet_claimed_elsewhere" });
  }

  return json({ ok: true, address: result.address, walletVersion: result.walletVersion });
}

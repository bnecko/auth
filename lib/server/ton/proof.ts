import { createHash } from "crypto";
import { Address, Cell, contractAddress, loadStateInit } from "@ton/core";
import { signVerify } from "@ton/crypto";

import { safeEqual } from "../crypto";
import { toRawAddress } from "./address";
import { lookupWalletCode, type WalletVersion } from "./walletCodes";

const MAINNET_CHAIN_ID = "-239";
const TON_PROOF_PREFIX = "ton-proof-item-v2/";
const TON_CONNECT_PREFIX = "ton-connect";
const SIGNATURE_BYTES = 64;
const PUBLIC_KEY_BYTES = 32;

// A wallet stateInit is a code cell and a small data cell; the largest one we
// accept here is an order of magnitude over the biggest of the four supported
// wallets, and the cap exists so a caller cannot make us parse megabytes.
const MAX_STATE_INIT_BYTES = 8 * 1024;
const MAX_PAYLOAD_LENGTH = 256;
const MAX_DOMAIN_LENGTH = 253;

// A wallet signs at the moment the user approves, so the proof is always a
// little older than its arrival. The backward window absorbs the approval
// itself and the bridge hop; the forward one only absorbs a wallet clock
// running fast, so it is deliberately much tighter.
const MAX_AGE_SECONDS = 900;
const MAX_CLOCK_SKEW_SECONDS = 300;

export type TonProofReason =
  | "malformed"
  | "network"
  | "workchain"
  | "domain"
  | "timestamp"
  | "payload"
  | "address_mismatch"
  | "unknown_wallet"
  | "signature";

export type TonProofInput = {
  address: string;
  network: string;
  walletStateInit: string;
  proof: {
    timestamp: number;
    domain: { lengthBytes: number; value: string };
    payload: string;
    signature: string;
  };
};

export type TonProofResult =
  | { ok: true; address: string; walletVersion: WalletVersion; publicKey: string }
  | { ok: false; reason: TonProofReason; codeHash?: string };

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest();

// The exact byte layout a TON Connect wallet signs. The mixed endianness is
// the specification's, not a mistake: the workchain is big endian while the
// domain length and timestamp are little endian.
function proofDigest(address: Address, domain: string, timestamp: number, payload: string): Buffer {
  const workchain = Buffer.alloc(4);
  workchain.writeInt32BE(address.workChain);

  const domainBytes = Buffer.from(domain, "utf8");
  const domainLength = Buffer.alloc(4);
  domainLength.writeUInt32LE(domainBytes.length);

  const signedAt = Buffer.alloc(8);
  signedAt.writeBigUInt64LE(BigInt(timestamp));

  const message = Buffer.concat([
    Buffer.from(TON_PROOF_PREFIX, "utf8"),
    workchain,
    address.hash,
    domainLength,
    domainBytes,
    signedAt,
    Buffer.from(payload, "utf8"),
  ]);

  return sha256(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from(TON_CONNECT_PREFIX, "utf8"), sha256(message)]));
}

function readPublicKey(data: Cell, bitOffset: number): Buffer | null {
  if (data.bits.length < bitOffset + PUBLIC_KEY_BYTES * 8) return null;
  const slice = data.beginParse();
  slice.skip(bitOffset);
  return slice.loadBuffer(PUBLIC_KEY_BYTES);
}

/**
 * Checks that whoever produced this proof holds the private key of the address
 * they are claiming. Pure: no database, no Redis, no network. The caller is
 * responsible for having issued `expectedPayload` to this user and for
 * consuming it exactly once.
 *
 * `expectedDomain` is a bare host, matching what a wallet puts in the signed
 * message, so it carries no scheme, port or path.
 */
export function verifyTonProof(
  input: TonProofInput,
  options: { expectedDomain: string; expectedPayload: string; now?: number },
): TonProofResult {
  const { proof } = input;
  const now = options.now ?? Math.floor(Date.now() / 1000);

  if (input.network !== MAINNET_CHAIN_ID) return { ok: false, reason: "network" };

  if (proof.payload.length > MAX_PAYLOAD_LENGTH) return { ok: false, reason: "payload" };
  if (!safeEqual(proof.payload, options.expectedPayload)) return { ok: false, reason: "payload" };

  // Binding the signature to our own host is what stops a proof collected by
  // another site from being replayed here. lengthBytes is signed alongside the
  // domain, so a mismatch means the bytes we are about to hash are not the
  // bytes the wallet hashed.
  if (proof.domain.value.length > MAX_DOMAIN_LENGTH) return { ok: false, reason: "domain" };
  if (proof.domain.lengthBytes !== Buffer.byteLength(proof.domain.value, "utf8")) {
    return { ok: false, reason: "domain" };
  }
  if (proof.domain.value.toLowerCase() !== options.expectedDomain.toLowerCase()) {
    return { ok: false, reason: "domain" };
  }

  if (!Number.isSafeInteger(proof.timestamp)) return { ok: false, reason: "timestamp" };
  if (proof.timestamp < now - MAX_AGE_SECONDS) return { ok: false, reason: "timestamp" };
  if (proof.timestamp > now + MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: "timestamp" };

  let claimed: Address;
  let code: Cell;
  let data: Cell;
  let signature: Buffer;
  try {
    signature = Buffer.from(proof.signature, "base64");
    const stateInitBytes = Buffer.from(input.walletStateInit, "base64");
    if (signature.length !== SIGNATURE_BYTES) return { ok: false, reason: "malformed" };
    if (stateInitBytes.length === 0 || stateInitBytes.length > MAX_STATE_INIT_BYTES) {
      return { ok: false, reason: "malformed" };
    }
    claimed = Address.parse(input.address);
    const stateInit = loadStateInit(Cell.fromBoc(stateInitBytes)[0].beginParse());
    if (!stateInit.code || !stateInit.data) return { ok: false, reason: "malformed" };
    code = stateInit.code;
    data = stateInit.data;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (claimed.workChain !== 0) return { ok: false, reason: "workchain" };

  // An address is the hash of the stateInit that created it, so this is what
  // ties the code and public key below to the address being claimed. Without
  // it a caller could hand us any wallet's stateInit alongside someone else's
  // address.
  if (!contractAddress(0, { code, data }).equals(claimed)) {
    return { ok: false, reason: "address_mismatch" };
  }

  const codeHash = code.hash().toString("hex");
  const wallet = lookupWalletCode(codeHash);
  if (!wallet) return { ok: false, reason: "unknown_wallet", codeHash };

  const publicKey = readPublicKey(data, wallet.pubkeyBitOffset);
  if (!publicKey) return { ok: false, reason: "malformed" };

  const digest = proofDigest(claimed, proof.domain.value, proof.timestamp, proof.payload);
  if (!signVerify(digest, signature, publicKey)) return { ok: false, reason: "signature" };

  return {
    ok: true,
    address: toRawAddress(claimed),
    walletVersion: wallet.version,
    publicKey: publicKey.toString("hex"),
  };
}

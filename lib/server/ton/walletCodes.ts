export type WalletVersion = "v3r1" | "v3r2" | "v4r2" | "w5r1";

type WalletCode = {
  version: WalletVersion;
  // Where the owner's Ed25519 public key starts inside the wallet's data cell,
  // counted in bits from the front. Not byte aligned for w5r1, whose data cell
  // opens with a one-bit "signatures allowed" flag.
  pubkeyBitOffset: number;
};

// The wallet versions whose storage layout we know, keyed by the hash of the
// contract's code cell. Recognising the code is what lets us read the owner's
// public key straight out of the stateInit the wallet handed us, so a proof is
// checked against a key the address itself commits to.
//
// The alternative, calling the contract's get_public_key method through an
// indexer, would put a third party inside an authentication decision: whoever
// answers that call could return a key they hold and take over any account.
// Pinning keeps verification self-contained and offline.
//
// Hashes and offsets were derived from the canonical @ton/ton contracts and
// cross-checked against mainnet on 2026-09-20; see tests/fixtures/tonWalletCodes.ts.
// Layouts:
//   v3r1, v3r2   seqno:32, subwallet:32, pubkey:256
//   v4r2         seqno:32, subwallet:32, pubkey:256, plugins:dict
//   w5r1         signatures_allowed:1, seqno:32, wallet_id:32, pubkey:256, extensions:dict
//
// Anything else is refused. That excludes multisig, highload, lockup and
// vesting wallets, none of which represent a single person holding one key,
// and any wallet version published after this list was written. The refusal
// records the unrecognised hash so the gap is visible rather than silent.
const WALLET_CODES = new Map<string, WalletCode>([
  ["b61041a58a7980b946e8fb9e198e3c904d24799ffa36574ea4251c41a566f581", { version: "v3r1", pubkeyBitOffset: 64 }],
  ["84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599", { version: "v3r2", pubkeyBitOffset: 64 }],
  ["feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0", { version: "v4r2", pubkeyBitOffset: 64 }],
  ["20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f", { version: "w5r1", pubkeyBitOffset: 65 }],
]);

export function lookupWalletCode(codeHash: string): WalletCode | null {
  return WALLET_CODES.get(codeHash) ?? null;
}

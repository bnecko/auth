import { Address } from "@ton/core";

// Every TON address we persist is stored in raw form: workchain, a colon, and
// the lowercase hex account hash. The friendly base64 spellings are display
// only, because one account has four of them (bounceable or not, mainnet or
// testnet) and storing whichever one a wallet happened to send would let the
// same wallet link twice under two different strings, defeating the unique
// index that stops two accounts claiming one address.
const RAW_ADDRESS = /^0:[0-9a-f]{64}$/;

export function isRawAddress(value: string): boolean {
  return RAW_ADDRESS.test(value);
}

export function toRawAddress(address: Address): string {
  return address.toRawString();
}

// Accepts either spelling and returns null instead of throwing, because the
// input is whatever a wallet or an API caller sent us.
export function parseAddress(value: string): Address | null {
  try {
    return Address.parse(value);
  } catch {
    return null;
  }
}

// Non-bounceable (UQ...) is the correct display form for a wallet: sending to
// the bounceable spelling of an undeployed wallet returns the funds.
export function toFriendlyAddress(raw: string): string {
  return Address.parse(raw).toString({ urlSafe: true, bounceable: false, testOnly: false });
}

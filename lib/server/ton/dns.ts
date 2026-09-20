import { createHash } from "crypto";
import { tonIndexerApiKey, tonIndexerUrl } from "../config";

// The TON DNS collection. Pinned, because a .ton name is only meaningful as an
// item of this specific collection: any collection can mint an item calling
// itself "someone.ton", so trusting a name or its metadata would let anyone
// claim any domain.
export const TON_DNS_COLLECTION = "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf";

// What a .ton label may contain. Matches the on-chain rules closely enough to
// reject anything that would not resolve, and keeps the value renderable.
export const TON_DOMAIN_LABEL = /^[a-z0-9-]{4,126}$/;

const REQUEST_TIMEOUT_MS = 8000;
const MAX_DOMAINS = 50;

export type OwnedDomain = { name: string; index: string };

/**
 * The NFT item index a .ton label maps to: sha256 over a zero byte, the label
 * length in bits, and the label itself. Deriving it locally is what lets a
 * name be checked without trusting what an indexer says the name is: we look
 * the item up by index and compare the owner, so the only claim we take from
 * the indexer is who holds it.
 */
export function dnsItemIndex(label: string): string {
  const digest = createHash("sha256")
    .update(Buffer.concat([Buffer.from([0]), Buffer.from([label.length * 2]), Buffer.from(label, "utf8")]))
    .digest("hex");
  return BigInt(`0x${digest}`).toString();
}

export function normalizeDomainLabel(value: string): string | null {
  const label = value.trim().toLowerCase().replace(/\.ton$/, "");
  return TON_DOMAIN_LABEL.test(label) ? label : null;
}

type NftItem = {
  index?: string;
  owner_address?: string;
  on_sale?: boolean;
  init?: boolean;
  content?: { domain?: string };
};

// A fixed, trusted host, so this uses a plain fetch with its own timeout
// rather than safeFetch's SSRF guard, matching how the Resend client is wired.
async function getItems(params: Record<string, string>): Promise<NftItem[]> {
  const url = new URL(`${tonIndexerUrl().replace(/\/+$/, "")}/nft/items`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const apiKey = tonIndexerApiKey();
  const res = await fetch(url, {
    // The key goes in a header, never the query string, so it stays out of
    // any proxy or error log that records the URL.
    headers: apiKey ? { "X-API-Key": apiKey } : {},
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ton indexer responded ${res.status}`);

  const body = (await res.json()) as { nft_items?: NftItem[] };
  return body.nft_items ?? [];
}

// An indexer reports addresses in mixed case; ours are stored lowercase.
const sameAddress = (a: string | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

// Keeps only items whose name actually hashes to the index they were returned
// under, so a doctored `content.domain` cannot smuggle in a name the item is
// not. On sale means the sale contract holds the item, not the user.
function usableDomain(item: NftItem): OwnedDomain | null {
  const label = normalizeDomainLabel(item.content?.domain ?? "");
  if (!label || !item.index || item.on_sale || item.init === false) return null;
  return dnsItemIndex(label) === String(item.index) ? { name: label, index: String(item.index) } : null;
}

export async function listOwnedDomains(address: string): Promise<OwnedDomain[]> {
  const items = await getItems({
    owner_address: address,
    collection_address: TON_DNS_COLLECTION,
    limit: String(MAX_DOMAINS),
  });
  return items
    .filter(item => sameAddress(item.owner_address, address))
    .map(usableDomain)
    .filter((domain): domain is OwnedDomain => domain !== null);
}

export async function ownsDomain(address: string, label: string): Promise<boolean> {
  const items = await getItems({
    collection_address: TON_DNS_COLLECTION,
    index: dnsItemIndex(label),
  });
  const item = items[0];
  return Boolean(item) && !item.on_sale && item.init !== false && sameAddress(item.owner_address, address);
}

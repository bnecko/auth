// TON chain reads for the worker: plain-CommonJS twin of
// lib/server/ton/dns.ts. The app needs this logic to list the domains an
// address owns while a user is choosing one; the worker needs it to re-check
// the chosen one later, and cannot import the TypeScript. Same collection,
// same index derivation, same acceptance rules. Keep the two in sync.

const { createHash } = require("crypto");

const TON_DNS_COLLECTION = "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf";
const REQUEST_TIMEOUT_MS = 8000;

// A .ton name is an NFT whose index is derived from the label, so we look the
// item up by an index we computed ourselves and only ask the indexer who holds
// it. Nothing it says the name is, is trusted.
function dnsItemIndex(label) {
  const digest = createHash("sha256")
    .update(Buffer.concat([Buffer.from([0]), Buffer.from([label.length * 2]), Buffer.from(label, "utf8")]))
    .digest("hex");
  return BigInt(`0x${digest}`).toString();
}

const sameAddress = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

function createIndexer({ baseUrl, apiKey, fetchImpl = fetch }) {
  async function ownsDomain(address, label) {
    const url = new URL(`${String(baseUrl).replace(/\/+$/, "")}/nft/items`);
    url.searchParams.set("collection_address", TON_DNS_COLLECTION);
    url.searchParams.set("index", dnsItemIndex(label));

    const res = await fetchImpl(url, {
      // Header, never the query string, so the key stays out of URL logs.
      headers: apiKey ? { "X-API-Key": apiKey } : {},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ton indexer responded ${res.status}`);

    const body = await res.json();
    const item = (body && body.nft_items) ? body.nft_items[0] : null;
    if (!item) return false;
    // On sale means the sale contract holds it, so the user no longer solely
    // controls the name even though they expect to get it back.
    if (item.on_sale || item.init === false) return false;
    return sameAddress(item.owner_address, address);
  }

  return { ownsDomain };
}

// Two quick retries inside the tick. A vendor blip should not cost a user
// their displayed domain for six hours, and should not be reported as a fault
// of ours either.
const RETRY_DELAYS_MS = [2000, 10_000];
const RECHECK_INTERVAL = "6 hours";
const CLAIM_BATCH_SIZE = 25;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function checkWithRetries(indexer, address, label, wait = sleep) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return { ok: true, owns: await indexer.ownsDomain(address, label) };
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_DELAYS_MS.length) await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  return { ok: false, error: lastError };
}

/**
 * Re-checks the .ton domains currently on display. A domain is a transferable
 * NFT, so one shown on a profile has to be re-verified or a sold name keeps
 * vouching for whoever used to hold it.
 *
 * Only a definite answer hides a domain. An indexer that is unreachable,
 * rate-limiting or returning errors leaves every row exactly as it was and
 * resolves false, which withholds this loop's heartbeat rather than quietly
 * unpublishing everyone's domain during someone else's outage.
 */
async function sweepTonDomains({ pool, indexer, log, notify, alerts, wait }) {
  if (!indexer) return true;

  const { rows } = await pool.query(
    `select user_id, address, display_domain
       from user_ton_wallets
      where display = 'domain'
        and (domain_checked_at is null or domain_checked_at < now() - interval '${RECHECK_INTERVAL}')
      order by domain_checked_at asc nulls first
      limit ${CLAIM_BATCH_SIZE}`,
  );
  if (rows.length === 0) return true;

  let failures = 0;
  for (const row of rows) {
    const result = await checkWithRetries(indexer, row.address, row.display_domain, wait);

    if (!result.ok) {
      failures += 1;
      log.warn("ton_domain_check_failed", { userId: Number(row.user_id), error: result.error });
      continue;
    }

    if (result.owns) {
      await pool.query(
        `update user_ton_wallets set domain_checked_at = now(), updated_at = now() where user_id = $1`,
        [row.user_id],
      );
      continue;
    }

    await pool.query(
      `update user_ton_wallets
          set display = 'hidden', display_domain = null, domain_checked_at = null, updated_at = now()
        where user_id = $1`,
      [row.user_id],
    );
    log.info("ton_domain_hidden", { userId: Number(row.user_id), domain: row.display_domain });
    if (notify) await notify(Number(row.user_id), row.display_domain);
  }

  if (failures === rows.length) {
    if (alerts) {
      await alerts.send(
        "ton_indexer_down",
        `TON indexer unreachable\nevery domain re-check failed (${failures})`,
        { windowSeconds: 3600 },
      );
    }
    return false;
  }
  return true;
}

module.exports = {
  TON_DNS_COLLECTION,
  dnsItemIndex,
  createIndexer,
  sweepTonDomains,
  checkWithRetries,
  RETRY_DELAYS_MS,
  CLAIM_BATCH_SIZE,
};

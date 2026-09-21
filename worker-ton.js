// TON chain reads for the worker: plain-CommonJS twin of
// lib/server/ton/dns.ts. The app needs this logic to list the domains an
// address owns while a user is choosing one; the worker needs it to re-check
// the chosen one later, and cannot import the TypeScript. Same collection,
// same index derivation, same acceptance rules. Keep the two in sync.

const { createHash } = require("crypto");
const { Address, Cell } = require("@ton/core");

const TON_DNS_COLLECTION = "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf";
const REQUEST_TIMEOUT_MS = 8000;

// A plain transfer carries either no body or one opening with a zero opcode
// (a text comment). Every other opcode is a different kind of message, which
// is what keeps jetton transfer notifications out: a fake jetton calling
// itself GRAM would otherwise look like an incoming payment.
const TEXT_COMMENT_OPCODE = "0x00000000";

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

// Accepts either spelling and returns the raw form the chain reports. An
// operator configures the donation address by pasting whatever their wallet
// showed them, which is the friendly base64 form, and that never compares
// equal to the raw form in a transaction. Lower-casing it does not help
// either: friendly addresses are base64, so folding the case breaks their
// checksum. Returns "" for anything unparseable, so a typo switches donations
// off loudly rather than silently matching nothing.
function normalizeAddress(value) {
  try {
    return Address.parse(String(value || "").trim()).toRawString();
  } catch {
    return "";
  }
}

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

  async function getJson(path, params) {
    const url = new URL(`${String(baseUrl).replace(/\/+$/, "")}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await fetchImpl(url, {
      headers: apiKey ? { "X-API-Key": apiKey } : {},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ton indexer responded ${res.status}`);
    return res.json();
  }

  // Ascending from just past where we left off, so a page is always the next
  // unread slice and re-reading it is harmless.
  async function accountTransactions(address, afterLt, limit = 100) {
    const body = await getJson("/transactions", {
      account: address,
      start_lt: String(BigInt(afterLt) + 1n),
      sort: "asc",
      limit: String(limit),
    });
    return (body && body.transactions) || [];
  }

  async function latestLt(address) {
    const body = await getJson("/transactions", { account: address, limit: "1", sort: "desc" });
    const tx = body && body.transactions && body.transactions[0];
    return tx ? String(tx.lt) : "0";
  }

  // Native balance of an account, in nanocoins, as a decimal string.
  async function accountBalance(address) {
    const body = await getJson("/accountStates", { address, include_boc: "false" });
    const account = body && body.accounts && body.accounts[0];
    return account && account.balance ? String(account.balance) : null;
  }

  return { ownsDomain, accountTransactions, latestLt, accountBalance };
}

// Reads the comment out of the message body rather than believing the
// indexer's own decoding of it, since the memo is what decides whose account
// gets credited.
function textComment(bodyBase64) {
  if (!bodyBase64) return null;
  try {
    const slice = Cell.fromBoc(Buffer.from(bodyBase64, "base64"))[0].beginParse();
    if (slice.remainingBits < 32) return null;
    if (slice.loadUint(32) !== 0) return null;
    return slice.loadStringTail();
  } catch {
    return null;
  }
}

/**
 * Works out whose payment this is and what they meant by it. Deposits and
 * donations arrive at the same address, so the memo is the only thing that
 * separates a gift from a balance the user can spend and withdraw.
 *
 * Deposit memos are checked first. They are the newer table and the more
 * consequential answer to get wrong.
 */
async function resolveMemo(pool, memo) {
  if (!memo) return null;
  const deposit = await pool.query(`select user_id from billing_deposit_memos where memo = $1`, [memo]);
  if (deposit.rows[0]) return { userId: Number(deposit.rows[0].user_id), purpose: "deposit" };
  const donation = await pool.query(`select user_id from ton_donation_memos where memo = $1`, [memo]);
  if (donation.rows[0]) return { userId: Number(donation.rows[0].user_id), purpose: "donation" };
  return null;
}

/**
 * Decides whether one transaction is a GRAM payment to the donation address,
 * and returns what to record. Everything that is not plainly that is refused:
 *
 * - external messages and messages to another account are not payments to us
 * - a bounced message is value on its way back to the sender
 * - an aborted transaction, or a failed compute or action phase, did not
 *   complete, so its value did not land
 * - a non-zero opcode is some other kind of message; jetton transfer
 *   notifications live here, which is how a fake jetton named GRAM is kept out
 * - extra currencies are ignored; only the native value counts
 */
function parseDonation(tx, ownerAddress) {
  const msg = tx && tx.in_msg;
  if (!msg || !msg.source) return null;
  if (!sameAddress(msg.destination, ownerAddress)) return null;
  if (msg.bounced) return null;

  const description = tx.description || {};
  if (description.aborted) return null;
  if (description.compute_ph && description.compute_ph.success === false) return null;
  if (description.action && description.action.success === false) return null;

  if (msg.opcode && msg.opcode !== TEXT_COMMENT_OPCODE) return null;

  const amountNano = BigInt(msg.value || "0");
  if (amountNano <= 0n) return null;

  const comment = textComment(msg.message_content && msg.message_content.body);
  return {
    txHash: tx.hash,
    txLt: String(tx.lt),
    amountNano,
    sender: String(msg.source || "").toLowerCase(),
    memo: comment ? comment.trim().toUpperCase() : null,
    txTime: Number(tx.now) || null,
  };
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

const DONATION_CURSOR = "ton_donations_lt";
const DONOR_THRESHOLD_NANO = 1_000_000_000n;
// Below this, an unmatched transfer is counted and dropped rather than stored.
// Anyone can send a hundredth of a coin to a public address, and the ledger
// should not be a place strangers can write to for free. A transfer whose memo
// does match a user is always recorded, however small.
const DUST_NANO = 10_000_000n;
const DONATION_PAGE_LIMIT = 100;

async function readCursor(pool) {
  const { rows } = await pool.query(`select value from worker_cursors where name = $1`, [DONATION_CURSOR]);
  return rows[0] ? rows[0].value : null;
}

async function writeCursor(pool, value) {
  await pool.query(
    `insert into worker_cursors (name, value) values ($1, $2)
     on conflict (name) do update set value = excluded.value, updated_at = now()`,
    [DONATION_CURSOR, value],
  );
}

// One transaction per donation, so a crash cannot leave a credited row without
// the badge it earned, or the badge without the row that justifies it.
async function recordDonation({ pool, donation, userId, log }) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    if (!userId && donation.amountNano < DUST_NANO) {
      await client.query("rollback");
      return { stored: false, becameDonor: false };
    }

    const inserted = await client.query(
      `insert into ton_donations (user_id, tx_hash, tx_lt, amount_nano, sender, memo, status, tx_time)
            values ($1, $2, $3, $4, $5, $6, $7, case when $8::bigint is null then null else to_timestamp($8::bigint) end)
       on conflict (tx_hash) do nothing
         returning id`,
      [
        userId,
        donation.txHash,
        donation.txLt,
        donation.amountNano.toString(),
        donation.sender,
        donation.memo,
        userId ? "credited" : "unmatched",
        donation.txTime,
      ],
    );

    // Already recorded on an earlier pass: re-reading a window is expected, so
    // this is the normal path, not an error.
    if (inserted.rowCount === 0) {
      await client.query("rollback");
      return { stored: false, becameDonor: false };
    }

    let becameDonor = false;
    if (userId) {
      // Cumulative, because an exchange withdrawal arrives with its fee taken
      // out and a single "1 GRAM" send would land just under the line.
      const { rows } = await client.query(
        `select coalesce(sum(amount_nano), 0)::text as total
           from ton_donations where user_id = $1 and status = 'credited'`,
        [userId],
      );
      if (BigInt(rows[0].total) >= DONOR_THRESHOLD_NANO) {
        const promoted = await client.query(
          `update users set donor_since = now(), updated_at = now()
            where id = $1 and donor_since is null returning id`,
          [userId],
        );
        becameDonor = promoted.rowCount > 0;
      }
    }

    await client.query("commit");
    log.info("ton_donation_recorded", {
      userId,
      amountNano: donation.amountNano.toString(),
      status: userId ? "credited" : "unmatched",
    });
    return { stored: true, becameDonor, userId };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reads new transactions at the donation address and records the ones that are
 * genuinely inbound GRAM payments.
 *
 * The cursor only ever moves across transactions that are final. A transaction
 * that is still emulated or unfinalised stops the pass where it is, because
 * advancing past one would lose it the moment it settles for real.
 */
async function sweepTonDonations({ pool, indexer, log, notify, alerts, ownerAddress, creditDeposit }) {
  if (!ownerAddress || !indexer) return true;

  const cursor = await readCursor(pool);
  if (cursor === null) {
    // First run starts at the present. An address that existed before this
    // feature did should not have its whole history credited retroactively.
    const latest = await indexer.latestLt(ownerAddress);
    await writeCursor(pool, latest);
    log.info("ton_donations_cursor_initialised", { lt: latest });
    return true;
  }

  let transactions;
  try {
    transactions = await indexer.accountTransactions(ownerAddress, cursor, DONATION_PAGE_LIMIT);
  } catch (err) {
    log.warn("ton_donations_fetch_failed", { error: err });
    if (alerts) {
      await alerts.send("ton_indexer_down", `TON indexer unreachable\ndonation sweep could not read transactions`, {
        windowSeconds: 3600,
      });
    }
    return false;
  }

  let highest = BigInt(cursor);
  for (const tx of transactions) {
    if (tx.emulated || tx.finality !== "finalized") break;

    const donation = parseDonation(tx, ownerAddress);
    if (donation) {
      const matched = await resolveMemo(pool, donation.memo);

      if (matched && matched.purpose === "deposit") {
        if (!creditDeposit) {
          log.warn("ton_deposit_skipped_no_crediter", { txHash: donation.txHash });
          break;
        }
        try {
          await creditDeposit({
            userId: matched.userId,
            amountNano: donation.amountNano.toString(),
            txHash: donation.txHash,
          });
          log.info("ton_deposit_credited", {
            userId: matched.userId,
            amountNano: donation.amountNano.toString(),
          });
        } catch (err) {
          // Someone's money. Stop the pass here rather than stepping over it:
          // the cursor stays behind this transaction and the next tick retries.
          log.error("ton_deposit_credit_failed", { txHash: donation.txHash, error: err });
          break;
        }
      } else {
        const result = await recordDonation({
          pool,
          donation,
          userId: matched ? matched.userId : null,
          log,
        });
        if (result.becameDonor && notify) await notify(result.userId);
      }
    }

    const lt = BigInt(tx.lt);
    if (lt > highest) highest = lt;
  }

  if (highest > BigInt(cursor)) await writeCursor(pool, highest.toString());
  return true;
}

/**
 * Checks the ledger against itself and against the chain.
 *
 * Three invariants, each of which is a different kind of wrong:
 *
 *   the whole ledger nets to zero      a transfer posted one leg and not the
 *                                      other, so money was invented
 *   every balance equals its legs      the cached balance and its entries
 *                                      disagree, so a figure shown to a user
 *                                      is not backed by the entries
 *   owed <= what the address holds     we claim to owe more btGRAM than there
 *                                      is GRAM to pay it with
 *
 * The third is one-directional on purpose: the deposit address also receives
 * donations, which are gifts rather than obligations, so holding more than is
 * owed is the normal state and only the reverse is a problem.
 *
 * Read only. It never corrects anything, because a discrepancy in a money
 * ledger is something a person needs to look at, not something a loop should
 * quietly paper over.
 */
async function reconcileBilling({ pool, indexer, log, alerts, ownerAddress }) {
  const { rows: drift } = await pool.query(
    `select b.account_id, b.balance_nano::text as cached,
            coalesce(sum(e.amount_nano), 0)::text as summed
       from billing_balances b
       left join billing_entries e on e.account_id = b.account_id
      group by b.account_id, b.balance_nano
     having b.balance_nano <> coalesce(sum(e.amount_nano), 0)`,
  );

  const { rows: totals } = await pool.query(
    `select coalesce(sum(amount_nano), 0)::text as net from billing_entries`,
  );
  const { rows: owedRows } = await pool.query(
    `select coalesce(sum(balance_nano), 0)::text as owed from billing_balances`,
  );

  const net = BigInt(totals[0].net);
  const owed = BigInt(owedRows[0].owed);
  const problems = [];

  if (drift.length > 0) {
    problems.push(`${drift.length} balance(s) disagree with their entries: ` +
      drift.map(r => `#${r.account_id} cached ${r.cached} vs ${r.summed}`).join(", "));
  }
  if (net !== 0n) problems.push(`ledger does not net to zero (${net})`);

  if (ownerAddress && indexer && indexer.accountBalance) {
    try {
      const onChain = await indexer.accountBalance(ownerAddress);
      if (onChain === null) {
        log.warn("billing_reconcile_no_balance", { ownerAddress });
      } else if (owed > BigInt(onChain)) {
        problems.push(`owed ${owed} exceeds the ${onChain} held on chain`);
      }
    } catch (err) {
      // A vendor being unreachable is not a discrepancy. Say so and move on
      // rather than paging someone about the ledger.
      log.warn("billing_reconcile_chain_unreachable", { error: err });
    }
  }

  if (problems.length === 0) {
    log.info("billing_reconciled", { owedNano: owed.toString() });
    return true;
  }

  log.error("billing_reconcile_failed", { problems });
  if (alerts) {
    await alerts.send("billing_drift", `Billing ledger discrepancy\n${problems.join("\n")}`, {
      windowSeconds: 3600,
    });
  }
  return true;
}

module.exports = {
  TON_DNS_COLLECTION,
  reconcileBilling,
  normalizeAddress,
  DONATION_CURSOR,
  DONOR_THRESHOLD_NANO,
  DUST_NANO,
  dnsItemIndex,
  createIndexer,
  sweepTonDomains,
  sweepTonDonations,
  resolveMemo,
  parseDonation,
  textComment,
  recordDonation,
  checkWithRetries,
  RETRY_DELAYS_MS,
  CLAIM_BATCH_SIZE,
};

import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const { dnsItemIndex, createIndexer, sweepTonDomains, checkWithRetries, TON_DNS_COLLECTION } =
  requireCjs('../../worker-ton.js');

const ADDRESS = '0:632aab6158113a18472a6ff7a94d116b4359e24ba67567530733047e9a701846';

function indexerReturning(item: unknown, ok = true) {
  const fetchImpl = vi.fn(async (_url: URL, _init: { headers: Record<string, string> }) => ({
    ok,
    status: ok ? 200 : 503,
    json: async () => ({ nft_items: item === null ? [] : [item] }),
  }));
  return { indexer: createIndexer({ baseUrl: 'https://indexer.test/v3', apiKey: 'k', fetchImpl }), fetchImpl };
}

describe('dnsItemIndex', () => {
  // The index a .ton label maps to is fixed by the chain, so these are the
  // values a real DNS item carries. Deriving them locally is what lets the
  // worker look an item up without trusting what an indexer calls it.
  it.each([
    ['bottleneck', '42361120045333734378233233899457330000289612688306450795661326254779049980084'],
    ['ton', '34531561876690960905942050053779253467240831313936384609556120448334230855871'],
    ['aaaa', '71822716196048890227933044167297369551707663701129272547559803984724554710752'],
  ])('derives the item index for %s', (label, expected) => {
    expect(dnsItemIndex(label)).toBe(expected);
  });
});

describe('createIndexer.ownsDomain', () => {
  it('looks the item up by collection and derived index, with the key in a header', async () => {
    const { indexer, fetchImpl } = indexerReturning({ owner_address: ADDRESS, on_sale: false, init: true });
    expect(await indexer.ownsDomain(ADDRESS, 'bottleneck')).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url.searchParams.get('collection_address')).toBe(TON_DNS_COLLECTION);
    expect(url.searchParams.get('index')).toBe(dnsItemIndex('bottleneck'));
    expect(url.search).not.toContain('k');
    expect(init.headers['X-API-Key']).toBe('k');
  });

  // Indexers report addresses in mixed case; ours are stored lowercase.
  it('compares addresses without regard to case', async () => {
    const { indexer } = indexerReturning({
      owner_address: ADDRESS.toUpperCase(),
      on_sale: false,
      init: true,
    });
    expect(await indexer.ownsDomain(ADDRESS, 'bottleneck')).toBe(true);
  });

  it('rejects a domain held by someone else', async () => {
    const { indexer } = indexerReturning({ owner_address: `0:${'9'.repeat(64)}`, on_sale: false, init: true });
    expect(await indexer.ownsDomain(ADDRESS, 'bottleneck')).toBe(false);
  });

  // While a name is listed, the sale contract holds it rather than the user.
  it('rejects a domain that is on sale', async () => {
    const { indexer } = indexerReturning({ owner_address: ADDRESS, on_sale: true, init: true });
    expect(await indexer.ownsDomain(ADDRESS, 'bottleneck')).toBe(false);
  });

  it('rejects an uninitialised item and a missing one', async () => {
    const uninitialised = indexerReturning({ owner_address: ADDRESS, on_sale: false, init: false });
    expect(await uninitialised.indexer.ownsDomain(ADDRESS, 'bottleneck')).toBe(false);

    const absent = indexerReturning(null);
    expect(await absent.indexer.ownsDomain(ADDRESS, 'bottleneck')).toBe(false);
  });

  it('throws rather than reporting false when the indexer errors', async () => {
    const { indexer } = indexerReturning(null, false);
    await expect(indexer.ownsDomain(ADDRESS, 'bottleneck')).rejects.toThrow('503');
  });
});

describe('checkWithRetries', () => {
  it('retries a failing check before giving up', async () => {
    const ownsDomain = vi.fn().mockRejectedValue(new Error('timeout'));
    const result = await checkWithRetries({ ownsDomain }, ADDRESS, 'bottleneck', async () => {});
    expect(result.ok).toBe(false);
    expect(ownsDomain).toHaveBeenCalledTimes(3);
  });

  it('stops at the first answer', async () => {
    const ownsDomain = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(true);
    const result = await checkWithRetries({ ownsDomain }, ADDRESS, 'bottleneck', async () => {});
    expect(result).toEqual({ ok: true, owns: true });
    expect(ownsDomain).toHaveBeenCalledTimes(2);
  });
});

describe('sweepTonDomains', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const due = [{ user_id: '1', address: ADDRESS, display_domain: 'bottleneck' }];

  function poolWith(rows: unknown[]) {
    const query = vi.fn(async (sql: string) => (sql.includes('select') ? { rows } : { rows: [] }));
    return { pool: { query }, query };
  }

  it('does nothing when no indexer is configured', async () => {
    const { pool, query } = poolWith(due);
    expect(await sweepTonDomains({ pool, indexer: null, log })).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('stamps a domain that is still held', async () => {
    const { pool, query } = poolWith(due);
    const ok = await sweepTonDomains({
      pool,
      indexer: { ownsDomain: async () => true },
      log,
      wait: async () => {},
    });
    expect(ok).toBe(true);
    expect(query.mock.calls[1][0]).toContain('domain_checked_at = now()');
  });

  it('hides a domain that moved, and says so', async () => {
    const { pool, query } = poolWith(due);
    const notify = vi.fn();
    const ok = await sweepTonDomains({
      pool,
      indexer: { ownsDomain: async () => false },
      log,
      notify,
      wait: async () => {},
    });
    expect(ok).toBe(true);
    expect(query.mock.calls[1][0]).toContain("display = 'hidden'");
    expect(notify).toHaveBeenCalledWith(1, 'bottleneck');
  });

  // Someone else's outage must not quietly unpublish everyone's domain, so a
  // failed check leaves the row alone and withholds the loop's heartbeat.
  it('changes nothing and reports failure when the indexer is down', async () => {
    const { pool, query } = poolWith(due);
    const alerts = { send: vi.fn() };
    const notify = vi.fn();
    const ok = await sweepTonDomains({
      pool,
      indexer: {
        ownsDomain: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
      log,
      notify,
      alerts,
      wait: async () => {},
    });

    expect(ok).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
    expect(alerts.send).toHaveBeenCalledWith(
      'ton_indexer_down',
      expect.stringContaining('unreachable'),
      { windowSeconds: 3600 },
    );
  });

  it('stays fresh when there is nothing due', async () => {
    const { pool } = poolWith([]);
    expect(await sweepTonDomains({ pool, indexer: { ownsDomain: async () => true }, log })).toBe(true);
  });
});

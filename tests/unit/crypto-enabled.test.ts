import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/redis', () => ({ default: {} }));

import { cryptoEnabled } from '@/lib/server/config';
import { oauthServerMetadata, parseOAuthScopes } from '@/lib/server/services/oauth';
import { GET as getTonConnectManifest } from '@/app/tonconnect-manifest.json/route';

const CRYPTO_LOOPS = ['ton_domains', 'ton_donations', 'billing_reconcile'];

// worker.js reads the switch once at load, so each case needs its own copy.
function loadWorker(): { LOOP_TOLERANCE_MS: Record<string, number>; staleLoops: (now: number, since: number) => string[] } {
  const require = createRequire(import.meta.url);
  const path = require.resolve('../../worker.js');
  delete require.cache[path];
  return require(path);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CRYPTO_ENABLED', () => {
  // A typo in a production env file has to fail towards off, not towards
  // holding funds.
  it.each(['', 'false', '1', 'TRUE', 'yes', ' true'])('treats %j as off', value => {
    vi.stubEnv('CRYPTO_ENABLED', value);
    expect(cryptoEnabled()).toBe(false);
  });

  it('is on only for the exact value true', () => {
    vi.stubEnv('CRYPTO_ENABLED', 'true');
    expect(cryptoEnabled()).toBe(true);
  });
});

describe('worker heartbeat with crypto off', () => {
  // staleLoops() waits on every listed loop. One that is listed but never
  // started would withhold the heartbeat for good and page the operator.
  it('does not wait on the crypto loops it never starts', () => {
    vi.stubEnv('CRYPTO_ENABLED', 'false');
    const worker = loadWorker();
    const stale = worker.staleLoops(Date.now(), 0);

    expect(stale.filter(loop => CRYPTO_LOOPS.includes(loop))).toEqual([]);
    expect(stale).toContain('webhook_delivery');
  });

  it('still waits on them when crypto is on', () => {
    vi.stubEnv('CRYPTO_ENABLED', 'true');
    const worker = loadWorker();

    expect(worker.staleLoops(Date.now(), 0)).toEqual(expect.arrayContaining(CRYPTO_LOOPS));
  });
});

describe('OAuth with crypto off', () => {
  it('stops advertising the crypto scopes and claims', () => {
    vi.stubEnv('CRYPTO_ENABLED', 'false');
    const metadata = oauthServerMetadata();

    expect(metadata.scopes_supported).toContain('openid');
    expect(metadata.scopes_supported).not.toContain('ton:read');
    expect(metadata.scopes_supported).not.toContain('billing:charge');
    expect(metadata.claims_supported).not.toContain('ton_address');
  });

  // Apps store their allowed scopes. Rejecting one that was valid yesterday
  // would break sign-in for that app, which has nothing to do with crypto.
  it('still accepts a crypto scope an app was granted earlier', () => {
    vi.stubEnv('CRYPTO_ENABLED', 'false');
    expect(parseOAuthScopes('openid ton:read billing:charge')).toEqual(['openid', 'ton:read', 'billing:charge']);
  });

  it('advertises them when crypto is on', () => {
    vi.stubEnv('CRYPTO_ENABLED', 'true');
    expect(oauthServerMetadata().scopes_supported).toEqual(expect.arrayContaining(['ton:read', 'billing:charge']));
  });
});

describe('TON Connect manifest', () => {
  it('is not served while crypto is off', async () => {
    vi.stubEnv('CRYPTO_ENABLED', 'false');
    expect((await getTonConnectManifest()).status).toBe(404);
  });

  it('is served when crypto is on', async () => {
    vi.stubEnv('CRYPTO_ENABLED', 'true');
    expect((await getTonConnectManifest()).status).toBe(200);
  });
});

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const creditDeposit = vi.fn(async () => ({ posted: true }));
vi.mock('@/lib/server/repositories/billing', () => ({ creditDeposit: (...a: unknown[]) => creditDeposit(...(a as [])) }));
vi.mock('@/lib/server/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST as credit } from '@/app/api/internal/billing/credit/route';

const SECRET = 'billing-secret-value';
const deposit = { userId: 5, amountNano: '1000000000', txHash: 'tx-hash-1' };

const call = (headers: Record<string, string>) =>
  credit(
    new NextRequest('http://app:3000/api/internal/billing/credit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(deposit),
    }),
  );

beforeEach(() => {
  creditDeposit.mockClear();
  vi.stubEnv('CRYPTO_ENABLED', 'true');
  vi.stubEnv('INTERNAL_BILLING_SECRET', SECRET);
  vi.stubEnv('INTERNAL_ANALYTICS_SECRET', 'analytics-secret-value');
});
afterEach(() => vi.unstubAllEnvs());

// This route writes a deposit into the ledger for any user and any amount.
describe('the route that credits a deposit', () => {
  it('credits for the worker', async () => {
    const res = await call({ 'x-bottleneck-internal-secret': SECRET });

    expect(res.status).toBe(200);
    expect(creditDeposit).toHaveBeenCalledOnce();
  });

  // The analytics secret rides along with every page view and is shared with
  // an outside caller. It used to be the key to this route as well.
  it('no longer opens for the analytics secret', async () => {
    const res = await call({ 'x-bottleneck-internal-secret': 'analytics-secret-value' });

    expect(res.status).toBe(403);
    expect(creditDeposit).not.toHaveBeenCalled();
  });

  // The route shares a port with the public site. Cloudflare stamps whatever it
  // forwards and a client cannot strip that, so a stamped request is an outside one.
  it('refuses a request that came in through the tunnel, even with the right secret', async () => {
    const res = await call({ 'x-bottleneck-internal-secret': SECRET, 'cf-ray': '8f1a2b3c4d5e6f70-AMS' });

    expect(res.status).toBe(403);
    expect(creditDeposit).not.toHaveBeenCalled();
  });

  it('refuses everyone while no secret is configured', async () => {
    vi.stubEnv('INTERNAL_BILLING_SECRET', '');

    const res = await call({ 'x-bottleneck-internal-secret': '' });

    expect(res.status).toBe(403);
    expect(creditDeposit).not.toHaveBeenCalled();
  });
});

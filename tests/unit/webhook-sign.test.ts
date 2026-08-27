import { describe, it, expect } from 'vitest';
import { signWebhookPayload } from '@/lib/server/webhooks';
import { verifyWebhookSignature } from '../../sdk/node/src/index';

// Pin the on-the-wire signature format so server and SDK do not drift.
// `verifyWebhookSignature` lives in the public SDK; if these tests fail,
// a published SDK release will not be able to verify our deliveries.
describe('webhook signing roundtrip', () => {
  const secret = 'whsec_test_0123456789abcdef';
  const body = JSON.stringify({ id: 'whd_xyz', type: 'activation.approved', data: { foo: 'bar' } });
  const timestamp = () => Math.floor(Date.now() / 1000);

  it('SDK verifyWebhookSignature accepts the server signature', () => {
    const ts = timestamp();
    const signature = signWebhookPayload({ secret, timestamp: ts, body });
    const ok = verifyWebhookSignature({
      secret,
      timestamp: String(ts),
      body,
      signature,
    });
    expect(ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = timestamp();
    const signature = signWebhookPayload({ secret, timestamp: ts, body });
    expect(
      verifyWebhookSignature({
        secret,
        timestamp: String(ts),
        body: body.replace('approved', 'denied'),
        signature,
      }),
    ).toBe(false);
  });

  it('rejects a signature replayed under a different timestamp', () => {
    const ts = timestamp();
    const signature = signWebhookPayload({ secret, timestamp: ts, body });
    expect(
      verifyWebhookSignature({
        secret,
        timestamp: String(ts + 60),
        body,
        signature,
      }),
    ).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const ts = timestamp();
    const signature = signWebhookPayload({ secret, timestamp: ts, body });
    expect(
      verifyWebhookSignature({
        secret: 'whsec_different',
        timestamp: String(ts),
        body,
        signature,
      }),
    ).toBe(false);
  });

  it('rejects a validly signed delivery outside the freshness window', () => {
    const ts = timestamp() - 600;
    const signature = signWebhookPayload({ secret, timestamp: ts, body });
    expect(
      verifyWebhookSignature({ secret, timestamp: String(ts), body, signature }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret,
        timestamp: String(ts),
        body,
        signature,
        toleranceSeconds: 900,
      }),
    ).toBe(true);
  });

  it('signature is deterministic for the same inputs', () => {
    const ts = timestamp();
    const a = signWebhookPayload({ secret, timestamp: ts, body });
    const b = signWebhookPayload({ secret, timestamp: ts, body });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

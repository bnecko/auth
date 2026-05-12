import { describe, it, expect } from 'vitest';
import { signWebhookPayload } from '@/lib/server/webhooks';
import { verifyWebhookSignature } from '../../sdk/node/src/index';

// Pin the on-the-wire signature format so server and SDK do not drift.
// `verifyWebhookSignature` lives in the public SDK; if these tests fail,
// a published SDK release will not be able to verify our deliveries.
describe('webhook signing roundtrip', () => {
  const secret = 'whsec_test_0123456789abcdef';
  const timestamp = 1715528400;
  const body = JSON.stringify({ id: 'whd_xyz', type: 'activation.approved', data: { foo: 'bar' } });

  it('SDK verifyWebhookSignature accepts the server signature', () => {
    const signature = signWebhookPayload({ secret, timestamp, body });
    const ok = verifyWebhookSignature({
      secret,
      timestamp: String(timestamp),
      body,
      signature,
    });
    expect(ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const signature = signWebhookPayload({ secret, timestamp, body });
    expect(
      verifyWebhookSignature({
        secret,
        timestamp: String(timestamp),
        body: body.replace('approved', 'denied'),
        signature,
      }),
    ).toBe(false);
  });

  it('rejects a different timestamp', () => {
    const signature = signWebhookPayload({ secret, timestamp, body });
    expect(
      verifyWebhookSignature({
        secret,
        timestamp: String(timestamp + 60),
        body,
        signature,
      }),
    ).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const signature = signWebhookPayload({ secret, timestamp, body });
    expect(
      verifyWebhookSignature({
        secret: 'whsec_different',
        timestamp: String(timestamp),
        body,
        signature,
      }),
    ).toBe(false);
  });

  it('signature is deterministic for the same inputs', () => {
    const a = signWebhookPayload({ secret, timestamp, body });
    const b = signWebhookPayload({ secret, timestamp, body });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

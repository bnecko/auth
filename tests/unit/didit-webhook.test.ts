import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  mapDiditStatus,
  verifyDiditWebhook,
  MAX_WEBHOOK_AGE_SECONDS,
} from '@/lib/server/kyc/diditWebhook';

const SECRET = 'secret_shared_key_value';
const NOW = 1789929452;
const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('hex');

// Key order deliberately not alphabetical, so the V2 canonicalisation has
// something to actually sort.
const BODY = JSON.stringify({
  webhook_type: 'session',
  status: 'Approved',
  session_id: 'sess_123',
  vendor_data: '42',
});

function verify(over: Partial<Parameters<typeof verifyDiditWebhook>[0]> = {}) {
  return verifyDiditWebhook({
    rawBody: BODY,
    signature: sign(BODY),
    signatureV2: null,
    timestamp: String(NOW),
    secret: SECRET,
    now: NOW,
    ...over,
  });
}

describe('verifyDiditWebhook', () => {
  it('accepts a delivery signed over the raw bytes', () => {
    expect(verify()).toEqual({ ok: true });
  });

  it('accepts the V2 signature over sorted compact JSON', () => {
    const canonical = '{"session_id":"sess_123","status":"Approved","vendor_data":"42","webhook_type":"session"}';
    expect(verify({ signature: null, signatureV2: sign(canonical) })).toEqual({ ok: true });
  });

  it('keeps non-ASCII unescaped when canonicalising', () => {
    const body = JSON.stringify({ status: 'Approved', note: 'Ünïcode' });
    const canonical = '{"note":"Ünïcode","status":"Approved"}';
    expect(
      verifyDiditWebhook({
        rawBody: body,
        signature: null,
        signatureV2: sign(canonical),
        timestamp: String(NOW),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a signature made with another key', () => {
    const forged = createHmac('sha256', 'not-the-secret').update(BODY).digest('hex');
    expect(verify({ signature: forged })).toEqual({ ok: false, reason: 'signature' });
  });

  it('rejects a body altered after signing', () => {
    const tampered = BODY.replace('"42"', '"999"');
    expect(verify({ rawBody: tampered })).toEqual({ ok: false, reason: 'signature' });
  });

  // A captured delivery must not be usable later: approval is what opens
  // withdrawals.
  it('rejects anything outside the five minute window', () => {
    expect(verify({ timestamp: String(NOW - MAX_WEBHOOK_AGE_SECONDS - 1) })).toEqual({
      ok: false,
      reason: 'timestamp',
    });
    expect(verify({ timestamp: String(NOW + MAX_WEBHOOK_AGE_SECONDS + 1) })).toEqual({
      ok: false,
      reason: 'timestamp',
    });
    expect(verify({ timestamp: null })).toEqual({ ok: false, reason: 'timestamp' });
  });

  it('refuses to verify anything when no secret is configured', () => {
    expect(verify({ secret: '' })).toEqual({ ok: false, reason: 'secret' });
  });

  it('rejects when neither signature header is present', () => {
    expect(verify({ signature: null, signatureV2: null })).toEqual({ ok: false, reason: 'signature' });
  });

  it('does not fall over on an unparseable body', () => {
    expect(verify({ rawBody: 'not json', signature: null, signatureV2: 'deadbeef' })).toEqual({
      ok: false,
      reason: 'signature',
    });
  });
});

describe('mapDiditStatus', () => {
  it.each([
    ['Approved', 'approved'],
    ['Declined', 'declined'],
    ['In Review', 'in_review'],
    ['Resubmitted', 'in_review'],
    ['Kyc Expired', 'expired'],
  ])('maps %s', (provider, expected) => {
    expect(mapDiditStatus(provider)).toBe(expected);
  });

  // A status we do not recognise must never be read as progress: guessing in
  // the approving direction would open withdrawals.
  it('refuses anything it does not recognise, including case variants', () => {
    expect(mapDiditStatus('approved')).toBeNull();
    expect(mapDiditStatus('Something New')).toBeNull();
    expect(mapDiditStatus(undefined)).toBeNull();
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mintAuthorizeCsrf, verifyAuthorizeCsrf } from '@/lib/server/oauthCsrf';

const SECRET = 'unit-test-csrf-secret-AAAAAAAA';

describe('authorize CSRF token', () => {
  let prev: string | undefined;

  beforeAll(() => {
    prev = process.env.OAUTH_CSRF_SECRET;
    process.env.OAUTH_CSRF_SECRET = SECRET;
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.OAUTH_CSRF_SECRET;
    else process.env.OAUTH_CSRF_SECRET = prev;
  });

  const bind = { sessionId: 42, clientId: 'app_abc', state: 'csrf123' };

  it('accepts a freshly-minted token', () => {
    const token = mintAuthorizeCsrf(bind);
    expect(verifyAuthorizeCsrf({ ...bind, token })).toBe(true);
  });

  it('rejects when the session id differs', () => {
    const token = mintAuthorizeCsrf(bind);
    expect(verifyAuthorizeCsrf({ ...bind, sessionId: 43, token })).toBe(false);
  });

  it('rejects when the client_id differs', () => {
    const token = mintAuthorizeCsrf(bind);
    expect(
      verifyAuthorizeCsrf({ ...bind, clientId: 'app_other', token }),
    ).toBe(false);
  });

  it('rejects when the state differs', () => {
    const token = mintAuthorizeCsrf(bind);
    expect(
      verifyAuthorizeCsrf({ ...bind, state: 'tampered', token }),
    ).toBe(false);
  });

  it('rejects a malformed token', () => {
    expect(verifyAuthorizeCsrf({ ...bind, token: 'not-a-token' })).toBe(false);
    expect(verifyAuthorizeCsrf({ ...bind, token: '' })).toBe(false);
    expect(verifyAuthorizeCsrf({ ...bind, token: '123' })).toBe(false);
  });

  it('rejects a token issued in the future', () => {
    const future = Math.floor(Date.now() / 1000) + 60;
    const goodSig = mintAuthorizeCsrf(bind).split('.')[1];
    expect(
      verifyAuthorizeCsrf({ ...bind, token: `${future}.${goodSig}` }),
    ).toBe(false);
  });

  it('rejects a token older than the 10-minute window', () => {
    const ancient = Math.floor(Date.now() / 1000) - (60 * 60);
    const goodSig = mintAuthorizeCsrf(bind).split('.')[1];
    expect(
      verifyAuthorizeCsrf({ ...bind, token: `${ancient}.${goodSig}` }),
    ).toBe(false);
  });
});

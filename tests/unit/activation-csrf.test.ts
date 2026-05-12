import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mintActivationCsrf, verifyActivationCsrf } from '@/lib/server/activationCsrf';

const SECRET = 'unit-test-activation-csrf-secret';

describe('activation CSRF token', () => {
  beforeAll(() => {
    vi.stubEnv('OAUTH_CSRF_SECRET', SECRET);
  });

  afterEach(() => {
    // keep env stubbed for the whole suite; afterAll would also work
  });

  const bind = { sessionId: 42, activationId: 'act_abc' };

  it('accepts a freshly-minted token', () => {
    const token = mintActivationCsrf(bind);
    expect(verifyActivationCsrf({ ...bind, token })).toBe(true);
  });

  it('rejects when the session id differs', () => {
    const token = mintActivationCsrf(bind);
    expect(verifyActivationCsrf({ ...bind, sessionId: 43, token })).toBe(false);
  });

  it('rejects when the activationId differs', () => {
    const token = mintActivationCsrf(bind);
    expect(
      verifyActivationCsrf({ ...bind, activationId: 'act_other', token }),
    ).toBe(false);
  });

  it('rejects a malformed token', () => {
    expect(verifyActivationCsrf({ ...bind, token: 'not-a-token' })).toBe(false);
    expect(verifyActivationCsrf({ ...bind, token: '' })).toBe(false);
    expect(verifyActivationCsrf({ ...bind, token: '123' })).toBe(false);
  });

  it('rejects a token older than the 10-minute window', () => {
    const ancient = Math.floor(Date.now() / 1000) - 60 * 60;
    const goodSig = mintActivationCsrf(bind).split('.')[1];
    expect(
      verifyActivationCsrf({ ...bind, token: `${ancient}.${goodSig}` }),
    ).toBe(false);
  });

  it('rejects a token issued in the future', () => {
    const future = Math.floor(Date.now() / 1000) + 60;
    const goodSig = mintActivationCsrf(bind).split('.')[1];
    expect(
      verifyActivationCsrf({ ...bind, token: `${future}.${goodSig}` }),
    ).toBe(false);
  });

  it('uses a different signature namespace than the OAuth CSRF token', async () => {
    // Sanity check: an OAuth-CSRF token with the same numeric session
    // id and an activationId string that happened to match a clientId
    // should not validate as an activation token. The signing input
    // namespaces are distinct.
    const { mintAuthorizeCsrf } = await import('@/lib/server/oauthCsrf');
    const oauthToken = mintAuthorizeCsrf({
      sessionId: bind.sessionId,
      clientId: bind.activationId,
      state: '',
    });
    expect(
      verifyActivationCsrf({ ...bind, token: oauthToken }),
    ).toBe(false);
  });
});

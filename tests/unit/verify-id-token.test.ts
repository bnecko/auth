import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign as signBytes } from 'crypto';

let verifyIdToken: typeof import('@/lib/server/services/oauth').verifyIdToken;
let authBaseUrl: typeof import('@/lib/server/config').authBaseUrl;

const ISSUER = 'http://verify-id-token-test.local';
const KID = 'test-key';

let privatePem: string;

function base64url(input: string) {
  return Buffer.from(input).toString('base64url');
}

function makeToken(payload: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const encodedHeader = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID, ...header }));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const sig = signBytes('RSA-SHA256', Buffer.from(signingInput), privatePem);
  return `${signingInput}.${sig.toString('base64url')}`;
}

describe('verifyIdToken', () => {
  let prevPem: string | undefined;
  let prevKeysJson: string | undefined;
  let prevBaseUrl: string | undefined;

  beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privatePem = privateKey.export({ format: 'pem', type: 'pkcs1' }).toString();

    prevPem = process.env.OIDC_PRIVATE_KEY_PEM;
    prevKeysJson = process.env.OIDC_SIGNING_KEYS_JSON;
    prevBaseUrl = process.env.AUTH_BASE_URL;

    process.env.OIDC_SIGNING_KEYS_JSON = JSON.stringify([
      { kid: KID, privateKeyPem: privatePem, status: 'active' },
    ]);
    delete process.env.OIDC_PRIVATE_KEY_PEM;
    process.env.AUTH_BASE_URL = ISSUER;

    // Import after env is set so config helpers see the test values.
    const oauth = await import('@/lib/server/services/oauth');
    verifyIdToken = oauth.verifyIdToken;
    const config = await import('@/lib/server/config');
    authBaseUrl = config.authBaseUrl;
  });

  afterAll(() => {
    if (prevPem === undefined) delete process.env.OIDC_PRIVATE_KEY_PEM;
    else process.env.OIDC_PRIVATE_KEY_PEM = prevPem;
    if (prevKeysJson === undefined) delete process.env.OIDC_SIGNING_KEYS_JSON;
    else process.env.OIDC_SIGNING_KEYS_JSON = prevKeysJson;
    if (prevBaseUrl === undefined) delete process.env.AUTH_BASE_URL;
    else process.env.AUTH_BASE_URL = prevBaseUrl;
  });

  function freshPayload(overrides: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return {
      iss: authBaseUrl(),
      sub: 'usr_test',
      aud: 'app_test',
      iat: now,
      exp: now + 60,
      ...overrides,
    };
  }

  it('accepts a fresh, correctly-issued token', () => {
    const token = makeToken(freshPayload());
    const claims = verifyIdToken(token);
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe('usr_test');
  });

  it('rejects an expired token', () => {
    const token = makeToken(freshPayload({ exp: Math.floor(Date.now() / 1000) - 60 }));
    expect(verifyIdToken(token)).toBeNull();
  });

  it('rejects a token with no exp claim', () => {
    const { exp: _exp, ...rest } = freshPayload();
    const token = makeToken(rest);
    expect(verifyIdToken(token)).toBeNull();
  });

  it('rejects a token whose iss differs from authBaseUrl()', () => {
    const token = makeToken(freshPayload({ iss: 'https://attacker.example.com' }));
    expect(verifyIdToken(token)).toBeNull();
  });

  it('rejects a token with no iss claim', () => {
    const { iss: _iss, ...rest } = freshPayload();
    const token = makeToken(rest);
    expect(verifyIdToken(token)).toBeNull();
  });

  it('rejects alg=none even when signature is empty', () => {
    const encodedHeader = base64url(JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID }));
    const encodedPayload = base64url(JSON.stringify(freshPayload()));
    const token = `${encodedHeader}.${encodedPayload}.`;
    expect(verifyIdToken(token)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = makeToken(freshPayload());
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${'A'.repeat(parts[2].length)}`;
    expect(verifyIdToken(tampered)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, type KeyObject, randomUUID, sign as signJwt } from 'crypto';
import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import { authBaseUrl } from '@/lib/server/config';
import { exchangeOAuthToken } from '@/lib/server/services/oauth';

const hasDb = Boolean(process.env.DATABASE_URL);
const hasOidc = Boolean(process.env.OIDC_PRIVATE_KEY_PEM || process.env.OIDC_SIGNING_KEYS_JSON);
const describeOAuth = hasDb && hasOidc ? describe : describe.skip;

const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

function pkceS256(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function makeRequest() {
  return new NextRequest('http://localhost/api/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

function generateClientKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = randomToken(8);
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' };
  return { privateKey, kid, jwks: { keys: [jwk] } };
}

function b64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signClientAssertion(input: {
  privateKey: KeyObject;
  kid: string;
  clientId: string;
  jti: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: input.kid };
  const payload = {
    iss: input.clientId,
    sub: input.clientId,
    aud: `${authBaseUrl()}/api/oauth/token`,
    jti: input.jti,
    iat: now,
    exp: now + 120,
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = signJwt('RSA-SHA256', Buffer.from(signingInput), input.privateKey);
  return `${signingInput}.${signature.toString('base64url')}`;
}

async function seedPrivateKeyJwtClient(jwks: object) {
  const token = randomToken(8);
  const username = `pkj_${token}`;
  const user = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'PkjTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!user) throw new Error('failed to seed user');
  const userId = Number(user.id);

  const slug = `pkj-${token.toLowerCase()}`;
  const app = await queryOne<{ id: string; public_id: string }>(
    `insert into external_apps (
       public_id, name, slug, owner_user_id, api_key_hash,
       allowed_redirect_urls, allowed_grant_types, allowed_scopes,
       client_type, token_endpoint_auth_method, issue_refresh_tokens, status, jwks
     )
     values (
       $1, 'PKJ Test App', $2, $3, $4,
       array['https://example.com/cb'],
       array['authorization_code', 'refresh_token'],
       array['profile:read'],
       'confidential', 'private_key_jwt', true, 'active', $5::jsonb
     )
     returning id, public_id`,
    [publicId('app'), slug, userId, hashToken(randomToken(32)), JSON.stringify(jwks)],
  );
  if (!app) throw new Error('failed to seed external app');
  return { userId, appId: Number(app.id), clientId: app.public_id };
}

async function createAuthCode(input: { userId: number; appId: number }) {
  const verifier = randomToken(48);
  const code = randomToken(32);
  await query(
    `insert into oauth_authorization_codes (
       code_hash, external_app_id, user_id, redirect_uri,
       code_challenge, code_challenge_method, scopes, nonce, ip, user_agent, expires_at
     )
     values ($1, $2, $3, 'https://example.com/cb', $4, 'S256', array['profile:read'], null, '127.0.0.1', 'test', $5)`,
    [
      hashToken(code),
      input.appId,
      input.userId,
      pkceS256(verifier),
      new Date(Date.now() + 10 * 60_000).toISOString(),
    ],
  );
  return { code, verifier };
}

function exchange(input: {
  clientId: string;
  code: string;
  verifier: string;
  assertion: string;
}) {
  return exchangeOAuthToken(
    {
      grant_type: 'authorization_code',
      client_id: input.clientId,
      code: input.code,
      redirect_uri: 'https://example.com/cb',
      code_verifier: input.verifier,
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: input.assertion,
    },
    makeRequest(),
  );
}

describeOAuth('OAuth private_key_jwt client authentication', () => {
  it('exchanges an authorization code authenticated by a signed client assertion', async () => {
    const key = generateClientKeypair();
    const { userId, appId, clientId } = await seedPrivateKeyJwtClient(key.jwks);
    const { code, verifier } = await createAuthCode({ userId, appId });
    const assertion = signClientAssertion({
      privateKey: key.privateKey,
      kid: key.kid,
      clientId,
      jti: randomUUID(),
    });

    const tokens = (await exchange({ clientId, code, verifier, assertion })) as {
      access_token: string;
      token_type: string;
      scope: string;
    };
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.scope).toBe('profile:read');
  });

  it('rejects a replayed client assertion reusing the same jti', async () => {
    const key = generateClientKeypair();
    const { userId, appId, clientId } = await seedPrivateKeyJwtClient(key.jwks);
    const jti = randomUUID();

    const first = await createAuthCode({ userId, appId });
    await exchange({
      clientId,
      code: first.code,
      verifier: first.verifier,
      assertion: signClientAssertion({ privateKey: key.privateKey, kid: key.kid, clientId, jti }),
    });

    // A brand-new authorization code with an assertion reusing the jti
    // must still be rejected: jti single-use is what stops assertion
    // replay even when the rest of the request is fresh.
    const second = await createAuthCode({ userId, appId });
    await expect(
      exchange({
        clientId,
        code: second.code,
        verifier: second.verifier,
        assertion: signClientAssertion({ privateKey: key.privateKey, kid: key.kid, clientId, jti }),
      }),
    ).rejects.toMatchObject({ code: 'invalid_client' });
  });

  it('rejects an assertion signed by a key absent from the client jwks', async () => {
    const registered = generateClientKeypair();
    const attacker = generateClientKeypair();
    const { userId, appId, clientId } = await seedPrivateKeyJwtClient(registered.jwks);
    const { code, verifier } = await createAuthCode({ userId, appId });

    // Sign with the attacker key but advertise the registered kid, so
    // key selection finds a key but the signature fails to verify.
    const assertion = signClientAssertion({
      privateKey: attacker.privateKey,
      kid: registered.kid,
      clientId,
      jti: randomUUID(),
    });

    await expect(exchange({ clientId, code, verifier, assertion })).rejects.toMatchObject({
      code: 'invalid_client',
    });
  });
});

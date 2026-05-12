import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import { exchangeOAuthToken, OAuthError } from '@/lib/server/services/oauth';

const hasDb = Boolean(process.env.DATABASE_URL);
const hasOidc = Boolean(process.env.OIDC_PRIVATE_KEY_PEM || process.env.OIDC_SIGNING_KEYS_JSON);
const describeOAuth = hasDb && hasOidc ? describe : describe.skip;

function pkceS256(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function makeRequest(formBody: Record<string, string>, headers: Record<string, string> = {}) {
  const body = new URLSearchParams(formBody);
  return new NextRequest('http://localhost/api/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body,
  });
}

async function seedClient() {
  const token = randomToken(8);
  const username = `oauthtest_${token}`;
  const email = `${username}@example.com`;
  const user = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, email, password_hash, status)
     values ($1, 'OAuthTest', $2, $3, 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, email],
  );
  if (!user) throw new Error('failed to seed user');
  const userId = Number(user.id);

  const clientSecret = randomToken(32);
  const slug = `oauthapp-${token.toLowerCase()}`;
  const app = await queryOne<{ id: string }>(
    `insert into external_apps (
       public_id, name, slug, owner_user_id,
       api_key_hash, oauth_client_secret_hash,
       allowed_redirect_urls, allowed_grant_types, allowed_scopes,
       client_type, token_endpoint_auth_method, issue_refresh_tokens,
       status
     )
     values (
       $1, 'OAuth Test App', $2, $3,
       $4, $4,
       array['https://example.com/cb'],
       array['authorization_code', 'refresh_token'],
       array['openid', 'profile', 'email', 'profile:read', 'email:read'],
       'confidential', 'client_secret_post', true,
       'active'
     )
     returning id`,
    [publicId('app'), slug, userId, hashToken(clientSecret)],
  );
  if (!app) throw new Error('failed to seed external app');

  const clientId = (await queryOne<{ public_id: string }>(
    `select public_id from external_apps where id = $1`,
    [Number(app.id)],
  ))!.public_id;

  return { userId, appId: Number(app.id), clientId, clientSecret };
}

async function seedCode(input: {
  appId: number;
  userId: number;
  codeChallenge: string;
  redirectUri?: string;
  scopes?: string[];
}) {
  const code = randomToken(32);
  await query(
    `insert into oauth_authorization_codes (
       code_hash, external_app_id, user_id,
       redirect_uri, code_challenge, code_challenge_method,
       scopes, nonce, ip, user_agent, expires_at
     )
     values ($1, $2, $3, $4, $5, 'S256', $6, null, '127.0.0.1', 'test', $7)`,
    [
      hashToken(code),
      input.appId,
      input.userId,
      input.redirectUri || 'https://example.com/cb',
      input.codeChallenge,
      input.scopes || ['profile:read'],
      new Date(Date.now() + 10 * 60_000).toISOString(),
    ],
  );
  return code;
}

describeOAuth('OAuth token exchange', () => {
  it('exchanges a valid authorization_code for an access token', async () => {
    const fixture = await seedClient();
    const verifier = randomToken(48);
    const code = await seedCode({
      appId: fixture.appId,
      userId: fixture.userId,
      codeChallenge: pkceS256(verifier),
    });

    const result = await exchangeOAuthToken(
      {
        grant_type: 'authorization_code',
        client_id: fixture.clientId,
        client_secret: fixture.clientSecret,
        code,
        redirect_uri: 'https://example.com/cb',
        code_verifier: verifier,
      },
      makeRequest({}),
    );

    expect(result.access_token).toBeTypeOf('string');
    expect(result.refresh_token).toBeTypeOf('string');
    expect(result.token_type).toBe('Bearer');
    expect(result.scope).toBe('profile:read');
  });

  it('rejects a second exchange of the same code', async () => {
    const fixture = await seedClient();
    const verifier = randomToken(48);
    const code = await seedCode({
      appId: fixture.appId,
      userId: fixture.userId,
      codeChallenge: pkceS256(verifier),
    });

    const body = {
      grant_type: 'authorization_code',
      client_id: fixture.clientId,
      client_secret: fixture.clientSecret,
      code,
      redirect_uri: 'https://example.com/cb',
      code_verifier: verifier,
    };

    await exchangeOAuthToken(body, makeRequest({}));
    await expect(exchangeOAuthToken(body, makeRequest({}))).rejects.toMatchObject({
      code: 'invalid_grant',
    });
  });

  it('rejects a mismatched PKCE code_verifier', async () => {
    const fixture = await seedClient();
    const realVerifier = randomToken(48);
    const code = await seedCode({
      appId: fixture.appId,
      userId: fixture.userId,
      codeChallenge: pkceS256(realVerifier),
    });

    await expect(
      exchangeOAuthToken(
        {
          grant_type: 'authorization_code',
          client_id: fixture.clientId,
          client_secret: fixture.clientSecret,
          code,
          redirect_uri: 'https://example.com/cb',
          code_verifier: randomToken(48),
        },
        makeRequest({}),
      ),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('rejects a redirect_uri that does not match the one bound to the code', async () => {
    const fixture = await seedClient();
    const verifier = randomToken(48);
    const code = await seedCode({
      appId: fixture.appId,
      userId: fixture.userId,
      codeChallenge: pkceS256(verifier),
    });

    await expect(
      exchangeOAuthToken(
        {
          grant_type: 'authorization_code',
          client_id: fixture.clientId,
          client_secret: fixture.clientSecret,
          code,
          // Same origin would still be wrong because the bound URI was /cb
          redirect_uri: 'https://example.com/other',
          code_verifier: verifier,
        },
        makeRequest({}),
      ),
    ).rejects.toBeInstanceOf(OAuthError);
  });

  it('rejects an unknown client_secret', async () => {
    const fixture = await seedClient();
    const verifier = randomToken(48);
    const code = await seedCode({
      appId: fixture.appId,
      userId: fixture.userId,
      codeChallenge: pkceS256(verifier),
    });

    await expect(
      exchangeOAuthToken(
        {
          grant_type: 'authorization_code',
          client_id: fixture.clientId,
          client_secret: 'totally-wrong-secret',
          code,
          redirect_uri: 'https://example.com/cb',
          code_verifier: verifier,
        },
        makeRequest({}),
      ),
    ).rejects.toMatchObject({ code: 'invalid_client' });
  });
});

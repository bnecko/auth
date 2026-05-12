import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { query, queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import {
  exchangeOAuthToken,
  introspectOAuthToken,
  oauthUserInfo,
  revokeOAuthToken,
} from '@/lib/server/services/oauth';

const hasDb = Boolean(process.env.DATABASE_URL);
const hasOidc = Boolean(process.env.OIDC_PRIVATE_KEY_PEM || process.env.OIDC_SIGNING_KEYS_JSON);
const describeOAuth = hasDb && hasOidc ? describe : describe.skip;

function pkceS256(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
  });
}

async function seedClient(scopes: string[] = ['profile:read', 'email:read', 'openid']) {
  const token = randomToken(8);
  const username = `iru_${token}`;
  const user = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'IruTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!user) throw new Error('failed to seed user');
  const userId = Number(user.id);

  const clientSecret = randomToken(32);
  const slug = `iru-${token.toLowerCase()}`;
  const app = await queryOne<{ id: string; public_id: string }>(
    `insert into external_apps (
       public_id, name, slug, owner_user_id,
       api_key_hash, oauth_client_secret_hash,
       allowed_redirect_urls, allowed_grant_types, allowed_scopes,
       client_type, token_endpoint_auth_method, issue_refresh_tokens, status
     )
     values (
       $1, 'IRU Test App', $2, $3, $4, $4,
       array['https://example.com/cb'],
       array['authorization_code', 'refresh_token'],
       $5::text[],
       'confidential', 'client_secret_post', true, 'active'
     )
     returning id, public_id`,
    [publicId('app'), slug, userId, hashToken(clientSecret), scopes],
  );
  if (!app) throw new Error('failed to seed external app');
  return { userId, appId: Number(app.id), clientId: app.public_id, clientSecret };
}

async function issueAccessToken(input: {
  userId: number;
  appId: number;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}) {
  const verifier = randomToken(48);
  const code = randomToken(32);
  await query(
    `insert into oauth_authorization_codes (
       code_hash, external_app_id, user_id,
       redirect_uri, code_challenge, code_challenge_method,
       scopes, nonce, ip, user_agent, expires_at
     )
     values ($1, $2, $3, 'https://example.com/cb', $4, 'S256', $5, null, '127.0.0.1', 'test', $6)`,
    [
      hashToken(code),
      input.appId,
      input.userId,
      pkceS256(verifier),
      input.scopes,
      new Date(Date.now() + 10 * 60_000).toISOString(),
    ],
  );

  const result = await exchangeOAuthToken(
    {
      grant_type: 'authorization_code',
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code,
      redirect_uri: 'https://example.com/cb',
      code_verifier: verifier,
    },
    makeRequest(),
  );
  return result as {
    access_token: string;
    refresh_token?: string;
    scope: string;
  };
}

describeOAuth('OAuth introspect / revoke / userinfo', () => {
  it('introspect returns active=true for a freshly-issued access token', async () => {
    const fixture = await seedClient(['profile:read']);
    const tokens = await issueAccessToken({ ...fixture, scopes: ['profile:read'] });
    const result = await introspectOAuthToken(
      {
        token: tokens.access_token,
        client_id: fixture.clientId,
        client_secret: fixture.clientSecret,
      },
      makeRequest(),
    );
    expect(result).toMatchObject({
      active: true,
      client_id: fixture.clientId,
      token_type: 'access_token',
      scope: 'profile:read',
    });
    expect(typeof result.exp).toBe('number');
  });

  it('introspect returns active=false for an unknown token', async () => {
    const fixture = await seedClient();
    const result = await introspectOAuthToken(
      {
        token: 'totally-unknown-token-value',
        client_id: fixture.clientId,
        client_secret: fixture.clientSecret,
      },
      makeRequest(),
    );
    expect(result).toEqual({ active: false });
  });

  it('revoke + introspect: token becomes inactive after revocation', async () => {
    const fixture = await seedClient(['profile:read']);
    const tokens = await issueAccessToken({ ...fixture, scopes: ['profile:read'] });

    await revokeOAuthToken(
      {
        token: tokens.access_token,
        token_type_hint: 'access_token',
        client_id: fixture.clientId,
        client_secret: fixture.clientSecret,
      },
      makeRequest(),
    );

    const result = await introspectOAuthToken(
      {
        token: tokens.access_token,
        client_id: fixture.clientId,
        client_secret: fixture.clientSecret,
      },
      makeRequest(),
    );
    expect(result).toEqual({ active: false });
  });

  it('userinfo returns scope-aware claims', async () => {
    const fixture = await seedClient(['profile:read', 'email:read']);
    const tokens = await issueAccessToken({
      ...fixture,
      scopes: ['profile:read', 'email:read'],
    });
    const info = await oauthUserInfo(tokens.access_token);
    expect(info).not.toBeNull();
    expect(info?.sub).toMatch(/^usr_/);
    expect(info?.username).toBeTruthy();
    expect(info?.email).toBeTruthy();
  });

  it('userinfo omits email when email scope is absent', async () => {
    const fixture = await seedClient(['profile:read']);
    const tokens = await issueAccessToken({ ...fixture, scopes: ['profile:read'] });
    const info = await oauthUserInfo(tokens.access_token);
    expect(info?.username).toBeTruthy();
    expect(info?.email).toBeUndefined();
  });

  it('userinfo returns null for a banned user', async () => {
    const fixture = await seedClient(['profile:read']);
    const tokens = await issueAccessToken({ ...fixture, scopes: ['profile:read'] });
    await query(`update users set status = 'banned' where id = $1`, [fixture.userId]);
    expect(await oauthUserInfo(tokens.access_token)).toBeNull();
  });

  it('userinfo returns null for an unknown token', async () => {
    expect(await oauthUserInfo('not-a-real-token')).toBeNull();
  });
});

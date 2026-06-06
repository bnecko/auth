import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import { createUser } from '@/lib/server/repositories/users';
import { createSession } from '@/lib/server/repositories/sessions';
import { mintAuthorizeCsrf } from '@/lib/server/oauthCsrf';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedOAuthApp(redirectUri = 'https://client.example.com/cb') {
  const token = randomToken(8);
  const slug = `oauthtest-${token.toLowerCase()}`;
  const clientId = publicId('app');
  const apiKey = randomToken(32);

  await queryOne<{ id: string }>(
    `insert into external_apps (
       public_id, name, slug,
       api_key_hash, oauth_client_secret_hash,
       allowed_redirect_urls, status
     )
     values ($1, 'OAuthTest', $2, $3, $3, $4, 'active')
     returning id`,
    [clientId, slug, hashToken(apiKey), [redirectUri]],
  );

  return { clientId, redirectUri };
}

describeDb('OAuth authorize: approve', () => {
  it('approve POST replies 303 (See Other) to the client redirect_uri', async () => {
    vi.stubEnv('OAUTH_CSRF_SECRET', 'test-csrf-secret');
    const { clientId, redirectUri } = await seedOAuthApp();

    const suffix = randomToken(6).toLowerCase();
    const user = await createUser({
      publicId: publicId('usr'),
      firstName: 'Consenter',
      username: `cons_${suffix}`,
      bio: null,
      email: `cons_${suffix}@example.com`,
      dob: null,
      passwordHash: 'x',
      telegram: null,
    });
    const sessionToken = randomToken();
    const session = await createSession({
      userId: user.id,
      token: sessionToken,
      ip: '',
      userAgent: '',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const csrf = mintAuthorizeCsrf({ sessionId: session.id, clientId, state: '' });

    const body = new URLSearchParams({
      csrf_token: csrf,
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'profile:read',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      scopes: 'profile:read',
    });
    const req = new NextRequest('http://localhost/api/oauth/authorize/approve', {
      method: 'POST',
      headers: {
        cookie: `bn_session=${sessionToken}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const { POST } = await import('@/app/api/oauth/authorize/approve/route');
    const res = await POST(req);

    // 303 (not the default 307) so the browser GETs the callback instead of
    // re-POSTing the auth code to it; Location is the client's redirect_uri
    // carrying the freshly minted code.
    expect(res.status).toBe(303);
    const location = res.headers.get('location') || '';
    expect(location.startsWith(redirectUri)).toBe(true);
    expect(location).toContain('code=');
  });

  it('approve POST with an invalid csrf token redirects to /expired (not JSON)', async () => {
    vi.stubEnv('OAUTH_CSRF_SECRET', 'test-csrf-secret');
    const { clientId, redirectUri } = await seedOAuthApp();

    const suffix = randomToken(6).toLowerCase();
    const user = await createUser({
      publicId: publicId('usr'),
      firstName: 'Consenter',
      username: `cons_${suffix}`,
      bio: null,
      email: `cons_${suffix}@example.com`,
      dob: null,
      passwordHash: 'x',
      telegram: null,
    });
    const sessionToken = randomToken();
    await createSession({
      userId: user.id,
      token: sessionToken,
      ip: '',
      userAgent: '',
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const body = new URLSearchParams({
      csrf_token: 'not-a-valid-token',
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'profile:read',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      scopes: 'profile:read',
    });
    const req = new NextRequest('http://localhost/api/oauth/authorize/approve', {
      method: 'POST',
      headers: {
        cookie: `bn_session=${sessionToken}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const { POST } = await import('@/app/api/oauth/authorize/approve/route');
    const res = await POST(req);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/expired?reason=invalid');
  });
});

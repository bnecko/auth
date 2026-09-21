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

  const app = await queryOne<{ id: string }>(
    `insert into external_apps (
       public_id, name, slug,
       api_key_hash, oauth_client_secret_hash,
       allowed_redirect_urls, status
     )
     values ($1, 'OAuthTest', $2, $3, $3, $4, 'active')
     returning id`,
    [clientId, slug, hashToken(apiKey), [redirectUri]],
  );

  return { clientId, redirectUri, appId: Number(app!.id) };
}

// A signed-in user who consented earlier, with a token issued under that
// consent, approving the same app again.
async function reconsent(input: { earlier: string[]; requested: string; granted: string[] }) {
  vi.stubEnv('OAUTH_CSRF_SECRET', 'test-csrf-secret');
  const { clientId, redirectUri, appId } = await seedOAuthApp();
  const suffix = randomToken(6).toLowerCase();
  const user = await createUser({
    publicId: publicId('usr'),
    firstName: 'Consenter',
    username: `recon_${suffix}`,
    bio: null,
    email: `recon_${suffix}@example.com`,
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
  await queryOne(
    `insert into app_authorizations (user_id, external_app_id, scopes) values ($1, $2, $3) returning user_id`,
    [user.id, appId, input.earlier],
  );
  const earlierToken = await queryOne<{ id: string }>(
    `insert into oauth_access_tokens (token_hash, external_app_id, user_id, subject, token_kind, scopes, expires_at)
     values ($1, $2, $3, $4, 'user', $5, now() + interval '1 hour') returning id`,
    [hashToken(randomToken(32)), appId, user.id, user.publicId, input.earlier],
  );

  const body = new URLSearchParams({
    csrf_token: mintAuthorizeCsrf({ sessionId: session.id, clientId, state: '' }),
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: input.requested,
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
  });
  for (const scope of input.granted) body.append('scopes', scope);
  const { POST } = await import('@/app/api/oauth/authorize/approve/route');
  const res = await POST(
    new NextRequest('http://localhost/api/oauth/authorize/approve', {
      method: 'POST',
      headers: { cookie: `bn_session=${sessionToken}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }),
  );

  const row = await queryOne<{ revoked: boolean }>(
    `select revoked_at is not null as revoked from oauth_access_tokens where id = $1`,
    [earlierToken!.id],
  );
  return { status: res.status, earlierTokenRevoked: row!.revoked };
}

describeDb('OAuth authorize: consenting again', () => {
  // Tokens carry the scopes they were issued with for their whole lifetime, so
  // unticking something would otherwise change what the user sees and nothing
  // the app can do.
  it('revokes tokens issued under a wider grant when the user takes a scope back', async () => {
    const result = await reconsent({
      earlier: ['profile:read', 'email:read'],
      requested: 'profile:read email:read',
      granted: ['profile:read'],
    });

    expect(result.status).toBe(303);
    expect(result.earlierTokenRevoked).toBe(true);
  });

  // Signing in to the same app again must not log its other devices out.
  it('leaves tokens alone when nothing was taken back', async () => {
    const result = await reconsent({
      earlier: ['profile:read'],
      requested: 'profile:read email:read',
      granted: ['profile:read', 'email:read'],
    });

    expect(result.status).toBe(303);
    expect(result.earlierTokenRevoked).toBe(false);
  });
});

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

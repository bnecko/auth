import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import {
  cancelExternalActivationRequest,
  createExternalActivationRequest,
  getAppForApiKey,
  listActivationRequestsForApp,
  revokeActivationForApp,
} from '@/lib/server/services/activation';
import { createUser } from '@/lib/server/repositories/users';
import { createSession } from '@/lib/server/repositories/sessions';
import { mintActivationCsrf } from '@/lib/server/activationCsrf';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

function makeRequest() {
  return new NextRequest('http://localhost/api/activation-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}

async function seedApp(allowedRedirectUrls: string[] = ['https://example.com/']) {
  const token = randomToken(8);
  const apiKey = randomToken(32);
  const slug = `acttest-${token.toLowerCase()}`;

  await queryOne<{ id: string }>(
    `insert into external_apps (
       public_id, name, slug,
       api_key_hash, oauth_client_secret_hash,
       allowed_redirect_urls, status
     )
     values ($1, 'ActivationTest', $2, $3, $3, $4, 'active')
     returning id`,
    [publicId('app'), slug, hashToken(apiKey), allowedRedirectUrls],
  );

  return { apiKey };
}

describeDb('Activation requests: createExternalActivationRequest', () => {
  it('rejects an unknown api key', async () => {
    await expect(
      createExternalActivationRequest('not-a-real-key', {}, makeRequest()),
    ).rejects.toThrow(/invalid app credentials/i);
  });

  it('creates an activation request for a valid api key', async () => {
    const { apiKey } = await seedApp();

    const result = await createExternalActivationRequest(
      apiKey,
      {
        requestedSubject: 'local-user-1',
        scopes: ['profile:read'],
        returnUrl: 'https://example.com/auth/return',
      },
      makeRequest(),
    );

    expect(result.id).toMatch(/^act_/);
    expect(result.token).toBeTypeOf('string');
    expect(result.activationUrl).toContain(result.token);
    // expiresAt is RFC 3339 (ISO 8601 with a Z offset), not Postgres text.
    expect(result.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    expect(new Date(result.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a returnUrl outside the allowed prefix list', async () => {
    const { apiKey } = await seedApp(['https://example.com/auth/']);

    await expect(
      createExternalActivationRequest(
        apiKey,
        {
          scopes: ['profile:read'],
          returnUrl: 'https://example.com.evil.com/auth/return',
        },
        makeRequest(),
      ),
    ).rejects.toThrow(/return url is not allowed/i);
  });

  it('rejects an unknown scope', async () => {
    const { apiKey } = await seedApp();

    await expect(
      createExternalActivationRequest(
        apiKey,
        { scopes: ['profile:read', 'wallet:drain'] },
        makeRequest(),
      ),
    ).rejects.toThrow();
  });

  it('cancel rejects when called with the wrong api key', async () => {
    const { apiKey: appAKey } = await seedApp();
    const { apiKey: appBKey } = await seedApp();

    const created = await createExternalActivationRequest(
      appAKey,
      { scopes: ['profile:read'] },
      makeRequest(),
    );

    // App B's key must not cancel app A's request
    const result = await cancelExternalActivationRequest(appBKey, created.id);
    expect(result).toBeNull();
  });

  it('GET status returns "expired" once a pending row is past expires_at', async () => {
    const { apiKey } = await seedApp();
    const created = await createExternalActivationRequest(
      apiKey,
      { scopes: ['profile:read'] },
      makeRequest(),
    );

    // Force the row past its expiry without going through a sweep.
    const { query } = await import('@/lib/server/db');
    await query(
      `update activation_requests set expires_at = now() - interval '1 minute' where public_id = $1`,
      [created.id],
    );

    const { GET } = await import('@/app/api/activation-requests/[id]/route');
    const req = new NextRequest('http://localhost/api/activation-requests/x', {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const res = await GET(req, { params: Promise.resolve({ id: created.id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; profile: unknown };
    expect(body.status).toBe('expired');
    expect(body.profile).toBeNull();
  });

  it('getAppForApiKey exposes the app config for pre-flight validation', async () => {
    const { apiKey } = await seedApp(['https://example.com/cb/']);
    const me = await getAppForApiKey(apiKey);
    expect(me.id).toMatch(/^app_/);
    expect(me.status).toBe('active');
    expect(me.allowedRedirectUrls).toEqual(['https://example.com/cb/']);
  });

  it('listActivationRequestsForApp returns the app rows, filtered by subject', async () => {
    const { apiKey } = await seedApp();
    await createExternalActivationRequest(
      apiKey,
      { scopes: ['profile:read'], requestedSubject: 'subj-a' },
      makeRequest(),
    );
    await createExternalActivationRequest(
      apiKey,
      { scopes: ['profile:read'], requestedSubject: 'subj-b' },
      makeRequest(),
    );

    const all = await listActivationRequestsForApp(apiKey, {});
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all[0].expiresAt).toMatch(/Z$/);

    const onlyA = await listActivationRequestsForApp(apiKey, { subject: 'subj-a' });
    expect(onlyA).toHaveLength(1);
    expect(onlyA[0].requestedSubject).toBe('subj-a');
  });

  it('revoke rejects a request that is not approved', async () => {
    const { apiKey } = await seedApp();
    const created = await createExternalActivationRequest(
      apiKey,
      { scopes: ['profile:read'] },
      makeRequest(),
    );
    await expect(
      revokeActivationForApp(apiKey, created.id, makeRequest()),
    ).rejects.toMatchObject({ code: 'not_approved' });
  });

  it('approve POST replies 303 (See Other) back to the activation page', async () => {
    vi.stubEnv('OAUTH_CSRF_SECRET', 'test-csrf-secret');
    const { apiKey } = await seedApp();
    const created = await createExternalActivationRequest(
      apiKey,
      { scopes: ['profile:read'] },
      makeRequest(),
    );

    const suffix = randomToken(6).toLowerCase();
    const user = await createUser({
      publicId: publicId('usr'),
      firstName: 'Approver',
      username: `appr_${suffix}`,
      bio: null,
      email: `appr_${suffix}@example.com`,
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
    const csrf = mintActivationCsrf({ sessionId: session.id, activationId: created.id });

    const body = new URLSearchParams({
      csrf_token: csrf,
      token: created.token,
      scopes: 'profile:read',
    });
    const req = new NextRequest(
      `http://localhost/api/activations/${created.id}/approve`,
      {
        method: 'POST',
        headers: {
          cookie: `bn_session=${sessionToken}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    const { POST } = await import('@/app/api/activations/[id]/approve/route');
    const res = await POST(req, { params: Promise.resolve({ id: created.id }) });

    // 303 (not the default 307) so the browser GETs the page instead of
    // re-POSTing to it; Location carries the token back to the success view.
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain(`/activate?token=${created.token}`);
  });
});

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import {
  cancelExternalActivationRequest,
  createExternalActivationRequest,
} from '@/lib/server/services/activation';

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
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
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
});

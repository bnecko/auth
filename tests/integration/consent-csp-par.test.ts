import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { queryOne } from '@/lib/server/db';
import { randomToken } from '@/lib/server/crypto';
import { createPushedRequest } from '@/lib/server/repositories/oauth';
import { consentFormActionOrigins } from '../../proxy';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedApp() {
  const suffix = randomToken(6);
  const row = await queryOne<{ id: string }>(
    `insert into external_apps (public_id, name, slug, api_key_hash)
     values ($1, $2, $3, $4) returning id`,
    [`app_csp_${suffix}`, 'CSP Test', `csp-${suffix}`, `hash_${suffix}`],
  );
  if (!row) throw new Error('failed to seed app');
  return Number(row.id);
}

async function seedPushedRequest(appId: number, redirectUri: string) {
  const requestUri = `urn:ietf:params:oauth:request_uri:${randomUUID()}`;
  await createPushedRequest({
    requestUri,
    appId,
    scopes: ['openid'],
    redirectUri,
    state: null,
    codeChallenge: null,
    codeChallengeMethod: null,
    nonce: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return requestUri;
}

describeDb('consentFormActionOrigins() PAR flow', () => {
  it('resolves the redirect origin from a pushed request', async () => {
    const appId = await seedApp();
    const requestUri = await seedPushedRequest(appId, 'https://app.example/cb');
    const req = new NextRequest(
      `https://auth.test/oauth/authorize?client_id=app_x&request_uri=${encodeURIComponent(requestUri)}`,
    );
    expect(await consentFormActionOrigins(req)).toEqual(['https://app.example']);
  });

  it('resolves http loopback redirect origins for dev clients', async () => {
    const appId = await seedApp();
    const requestUri = await seedPushedRequest(appId, 'http://localhost:3000/callback');
    const req = new NextRequest(
      `https://auth.test/oauth/authorize?client_id=app_x&request_uri=${encodeURIComponent(requestUri)}`,
    );
    expect(await consentFormActionOrigins(req)).toEqual(['http://localhost:3000']);
  });

  it('prefers the pushed request over a query redirect_uri on a crafted link', async () => {
    const appId = await seedApp();
    const requestUri = await seedPushedRequest(appId, 'https://real.example/cb');
    const req = new NextRequest(
      `https://auth.test/oauth/authorize?client_id=app_x&request_uri=${encodeURIComponent(requestUri)}&redirect_uri=${encodeURIComponent('https://attacker.example/cb')}`,
    );
    expect(await consentFormActionOrigins(req)).toEqual(['https://real.example']);
  });

  it('returns nothing for an unknown request_uri', async () => {
    const req = new NextRequest(
      'https://auth.test/oauth/authorize?client_id=app_x&request_uri=urn:ietf:params:oauth:request_uri:missing',
    );
    expect(await consentFormActionOrigins(req)).toEqual([]);
  });

  it('ignores request_uri outside the consent page', async () => {
    const appId = await seedApp();
    const requestUri = await seedPushedRequest(appId, 'https://app.example/cb');
    const req = new NextRequest(
      `https://auth.test/account?request_uri=${encodeURIComponent(requestUri)}`,
    );
    expect(await consentFormActionOrigins(req)).toEqual([]);
  });
});

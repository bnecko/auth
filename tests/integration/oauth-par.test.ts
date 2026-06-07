import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { query } from '@/lib/server/db';
import { createPushedRequest, consumePushedRequest } from '@/lib/server/repositories/oauth';

describe('PAR single-use (RFC 9126)', () => {
  let appId: number;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const rows = await query<{ id: string }>(
      `insert into external_apps (public_id, name, slug, api_key_hash, oauth_client_secret_hash)
       values ($1, $2, $3, $4, $4) returning id`,
      [`app_par_${suffix}`, 'PAR Test', `par-${suffix}`, `hash_${suffix}`],
    );
    appId = Number(rows[0].id);
  });

  async function seedRequest() {
    const requestUri = `urn:ietf:params:oauth:request_uri:${randomUUID()}`;
    await createPushedRequest({
      requestUri,
      appId,
      scopes: ['openid', 'profile'],
      redirectUri: 'https://app.example/cb',
      state: 'state-1',
      codeChallenge: 'challenge-1',
      codeChallengeMethod: 'S256',
      nonce: 'nonce-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    return requestUri;
  }

  it('consumes a request_uri exactly once', async () => {
    const requestUri = await seedRequest();
    const first = await consumePushedRequest(requestUri);
    expect(first).not.toBeNull();
    expect(first?.redirectUri).toBe('https://app.example/cb');

    const second = await consumePushedRequest(requestUri);
    expect(second).toBeNull();
  });

  it('does not consume an expired request_uri', async () => {
    const requestUri = `urn:ietf:params:oauth:request_uri:${randomUUID()}`;
    await createPushedRequest({
      requestUri,
      appId,
      scopes: ['openid'],
      redirectUri: 'https://app.example/cb',
      state: null,
      codeChallenge: 'c',
      codeChallengeMethod: 'S256',
      nonce: null,
      expiresAt: new Date(Date.now() - 1_000),
    });
    expect(await consumePushedRequest(requestUri)).toBeNull();
  });
});

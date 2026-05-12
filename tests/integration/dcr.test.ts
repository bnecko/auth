import { describe, expect, it } from 'vitest';
import { queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import {
  approveOAuthClientRegistrationRequest,
  createOAuthClientRegistrationRequest,
  findOAuthClientRegistrationRequestForToken,
  listPendingOAuthClientRegistrationRequests,
  revealOAuthClientRegistrationSecret,
} from '@/lib/server/repositories/oauthClientRegistrations';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedAdmin() {
  const username = `dcr_admin_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, email, password_hash, status, role)
     values ($1, 'Admin', $2, $3, 'testhash', 'active', 'admin')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed admin');
  return Number(row.id);
}

describeDb('dynamic client registration', () => {
  it('creates a request that surfaces in the pending list', async () => {
    const registrationToken = `reg_${randomToken(32)}`;
    const clientId = `app_dcr_${randomToken(8)}`;
    const created = await createOAuthClientRegistrationRequest({
      publicId: clientId,
      registrationToken,
      clientName: 'DCR Test',
      redirectUris: ['https://example.com/cb'],
      postLogoutRedirectUris: ['https://example.com/logout'],
      grantTypes: ['authorization_code', 'refresh_token'],
      scopes: ['openid', 'profile'],
      tokenEndpointAuthMethod: 'private_key_jwt',
      clientType: 'confidential',
      oauthProfileVersion: 'bn-oauth-2026-05',
      jwksUri: 'https://example.com/jwks.json',
      jwks: null,
      requesterIp: '127.0.0.1',
      requesterUserAgent: 'test',
      requesterCountry: 'XX',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    expect(created.publicId).toBe(clientId);
    expect(created.tokenEndpointAuthMethod).toBe('private_key_jwt');
    expect(created.jwksUri).toBe('https://example.com/jwks.json');
    expect(created.postLogoutRedirectUris).toEqual(['https://example.com/logout']);
    expect(created.hasPlaintextClientSecret).toBe(false);

    const pending = await listPendingOAuthClientRegistrationRequests();
    expect(pending.some(r => r.publicId === clientId)).toBe(true);

    const byToken = await findOAuthClientRegistrationRequestForToken(clientId, registrationToken);
    expect(byToken?.id).toBe(created.id);
  });

  it('approves a request and creates a matching external_apps row', async () => {
    const adminId = await seedAdmin();
    const registrationToken = `reg_${randomToken(32)}`;
    const clientId = `app_dcr_${randomToken(8)}`;
    const created = await createOAuthClientRegistrationRequest({
      publicId: clientId,
      registrationToken,
      clientName: 'DCR Approve',
      redirectUris: ['https://example.com/cb'],
      postLogoutRedirectUris: ['https://example.com/logout'],
      grantTypes: ['authorization_code', 'refresh_token'],
      scopes: ['openid', 'profile'],
      tokenEndpointAuthMethod: 'private_key_jwt',
      clientType: 'confidential',
      oauthProfileVersion: 'bn-oauth-2026-05',
      jwksUri: null,
      jwks: { keys: [{ kty: 'RSA', kid: 'k1' }] },
      requesterIp: '127.0.0.1',
      requesterUserAgent: 'test',
      requesterCountry: 'XX',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const apiKey = `key_${randomToken(32)}`;
    const slug = `dcr-approve-${randomToken(4).toLowerCase()}`;
    const approved = await approveOAuthClientRegistrationRequest({
      id: created.id,
      publicId: clientId,
      slug,
      apiKey,
      clientSecret: null,
      reviewedByUserId: adminId,
    });
    expect(approved?.status).toBe('approved');
    expect(approved?.externalAppId).toBeTypeOf('number');

    const app = await queryOne<{
      token_endpoint_auth_method: string;
      jwks: unknown;
      post_logout_redirect_urls: string[];
    }>(
      `select token_endpoint_auth_method, jwks, post_logout_redirect_urls
         from external_apps
        where id = $1`,
      [approved!.externalAppId!],
    );
    expect(app?.token_endpoint_auth_method).toBe('private_key_jwt');
    expect(app?.jwks).toEqual({ keys: [{ kty: 'RSA', kid: 'k1' }] });
    expect(app?.post_logout_redirect_urls).toEqual(['https://example.com/logout']);
  });

  it('revealOAuthClientRegistrationSecret is one-time and returns null afterwards', async () => {
    const adminId = await seedAdmin();
    const registrationToken = `reg_${randomToken(32)}`;
    const clientId = `app_dcr_${randomToken(8)}`;
    const created = await createOAuthClientRegistrationRequest({
      publicId: clientId,
      registrationToken,
      clientName: 'DCR Reveal',
      redirectUris: ['https://example.com/cb'],
      postLogoutRedirectUris: [],
      grantTypes: ['authorization_code'],
      scopes: ['openid'],
      tokenEndpointAuthMethod: 'client_secret_post',
      clientType: 'confidential',
      oauthProfileVersion: 'bn-oauth-2026-05',
      jwksUri: null,
      jwks: null,
      requesterIp: '127.0.0.1',
      requesterUserAgent: 'test',
      requesterCountry: '',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const apiKey = `key_${randomToken(32)}`;
    const clientSecret = `sec_${randomToken(32)}`;
    const slug = `dcr-reveal-${randomToken(4).toLowerCase()}`;
    await approveOAuthClientRegistrationRequest({
      id: created.id,
      publicId: clientId,
      slug,
      apiKey,
      clientSecret,
      reviewedByUserId: adminId,
    });

    const first = await revealOAuthClientRegistrationSecret({ publicId: clientId, registrationToken });
    expect(first).toBe(clientSecret);

    const second = await revealOAuthClientRegistrationSecret({ publicId: clientId, registrationToken });
    expect(second).toBeNull();
  });
});

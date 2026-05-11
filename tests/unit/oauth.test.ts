import { describe, expect, it } from 'vitest';
import {
  enforceClientGrant,
  enforceClientScopes,
  OAuthError,
  parseOAuthScopes,
} from '@/lib/server/services/oauth';
import type { ExternalApp } from '@/lib/server/types';

const app: ExternalApp = {
  id: 1,
  publicId: 'app_test',
  name: 'Test App',
  slug: 'test-app',
  ownerUserId: 1,
  callbackUrl: null,
  allowedRedirectUrls: ['https://example.com/callback'],
  clientType: 'confidential',
  tokenEndpointAuthMethod: 'client_secret_post',
  allowedGrantTypes: ['authorization_code', 'refresh_token'],
  allowedScopes: ['openid', 'profile', 'email'],
  issueRefreshTokens: true,
  requiredProduct: null,
  status: 'active',
};

describe('oauth policy helpers', () => {
  it('deduplicates known scopes', () => {
    expect(parseOAuthScopes('openid profile profile')).toEqual(['openid', 'profile']);
  });

  it('rejects unknown scopes', () => {
    expect(() => parseOAuthScopes('openid admin:write')).toThrow(OAuthError);
  });

  it('enforces client scope allowlists', () => {
    expect(() => enforceClientScopes(app, ['openid', 'profile'])).not.toThrow();
    expect(() => enforceClientScopes(app, ['subscription:read'])).toThrow(OAuthError);
  });

  it('enforces client grant allowlists', () => {
    expect(() => enforceClientGrant(app, 'authorization_code')).not.toThrow();
    expect(() => enforceClientGrant(app, 'client_credentials')).toThrow(OAuthError);
  });
});

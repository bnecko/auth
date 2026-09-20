import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/redis', () => ({ default: {} }));

import { OAUTH_SCOPE_LIST, parseOAuthScopes } from '@/lib/server/services/oauth';
import { parseScopes } from '@/lib/server/validation';

describe('ton:read scope', () => {
  it('is a scope an OAuth client can ask for', () => {
    expect(OAUTH_SCOPE_LIST).toContain('ton:read');
    expect(parseOAuthScopes('openid ton:read')).toEqual(['openid', 'ton:read']);
  });

  // The activation approval screen renders only the scopes it has labels for,
  // so a scope it cannot describe must not be accepted there: otherwise a user
  // could approve something they were never shown.
  it('is not accepted by the activation flow', () => {
    expect(() => parseScopes(['ton:read'])).toThrow();
  });

  it('is still rejected when misspelled', () => {
    expect(() => parseOAuthScopes('ton')).toThrow();
    expect(() => parseOAuthScopes('ton:write')).toThrow();
  });
});

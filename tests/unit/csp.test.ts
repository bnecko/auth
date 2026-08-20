import { afterEach, describe, expect, it, vi } from 'vitest';
import { consentFormActionOrigin, contentSecurityPolicy, nonce } from '../../proxy';

describe('nonce()', () => {
  it('returns a base64 string with non-trivial entropy', () => {
    const a = nonce();
    const b = nonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a.length).toBeGreaterThanOrEqual(20);
    expect(a).not.toBe(b);
  });
});

describe('contentSecurityPolicy()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function parse(policy: string) {
    return Object.fromEntries(
      policy
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
          const [name, ...rest] = part.split(/\s+/);
          return [name, rest];
        }),
    ) as Record<string, string[]>;
  }

  it('includes every required directive', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const policy = parse(contentSecurityPolicy('abc123'));
    for (const directive of [
      'default-src',
      'base-uri',
      'frame-ancestors',
      'form-action',
      'img-src',
      'script-src',
      'frame-src',
      'style-src',
      'font-src',
      'connect-src',
      'object-src',
    ]) {
      expect(policy[directive], `missing directive: ${directive}`).toBeDefined();
    }
    expect(policy['frame-ancestors']).toEqual(["'none'"]);
    expect(policy['object-src']).toEqual(["'none'"]);
  });

  it('production script-src uses nonce + strict-dynamic, never unsafe-inline', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const policy = parse(contentSecurityPolicy('NONCE_VALUE_42'));
    expect(policy['script-src']).toContain("'nonce-NONCE_VALUE_42'");
    expect(policy['script-src']).toContain("'strict-dynamic'");
    expect(policy['script-src']).not.toContain("'unsafe-inline'");
    expect(policy['script-src']).not.toContain("'unsafe-eval'");
  });

  it('non-production script-src allows unsafe-inline and unsafe-eval for dev tooling', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const policy = parse(contentSecurityPolicy('NONCE_VALUE_42'));
    expect(policy['script-src']).toContain("'unsafe-inline'");
    expect(policy['script-src']).toContain("'unsafe-eval'");
    expect(policy['script-src']).not.toContain("'strict-dynamic'");
  });

  it('style-src includes Google Fonts and conditionally unsafe-inline in dev', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const prodPolicy = parse(contentSecurityPolicy('n'));
    expect(prodPolicy['style-src']).toContain('https://fonts.googleapis.com');
    expect(prodPolicy['style-src']).not.toContain("'unsafe-inline'");

    vi.stubEnv('NODE_ENV', 'test');
    const devPolicy = parse(contentSecurityPolicy('n'));
    expect(devPolicy['style-src']).toContain("'unsafe-inline'");
  });

  it('form-action defaults to self only', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const policy = parse(contentSecurityPolicy('n'));
    expect(policy['form-action']).toEqual(["'self'"]);
  });

  it('adds extra form-action origins for the OAuth consent redirect', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const policy = parse(contentSecurityPolicy('n', ['https://readme.bottleneck.cc']));
    expect(policy['form-action']).toContain("'self'");
    expect(policy['form-action']).toContain('https://readme.bottleneck.cc');
  });

  it('allows Turnstile and Telegram script and frame sources', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const policy = parse(contentSecurityPolicy('n'));
    expect(policy['script-src']).toContain('https://challenges.cloudflare.com');
    expect(policy['script-src']).toContain('https://telegram.org');
    expect(policy['frame-src']).toContain('https://challenges.cloudflare.com');
    expect(policy['frame-src']).toContain('https://telegram.org');
    expect(policy['frame-src']).toContain('https://oauth.telegram.org');
  });
});

describe('consentFormActionOrigin()', () => {
  it('keeps https origins and drops the path', () => {
    expect(consentFormActionOrigin('https://app.example/cb?x=1')).toBe('https://app.example');
  });

  it('keeps http loopback origins with their port', () => {
    expect(consentFormActionOrigin('http://localhost:3000/callback')).toBe('http://localhost:3000');
    expect(consentFormActionOrigin('http://127.0.0.1:8080/cb')).toBe('http://127.0.0.1:8080');
  });

  it('rejects http on non-loopback hosts', () => {
    expect(consentFormActionOrigin('http://app.example/cb')).toBeNull();
  });

  it('rejects non-http schemes and malformed values', () => {
    expect(consentFormActionOrigin('ftp://localhost/cb')).toBeNull();
    expect(consentFormActionOrigin('custom-scheme://cb')).toBeNull();
    expect(consentFormActionOrigin('not a url')).toBeNull();
  });

  it('rejects origins that would split the CSP directive', () => {
    expect(consentFormActionOrigin('https://evil.example;script-src/cb')).toBeNull();
  });
});

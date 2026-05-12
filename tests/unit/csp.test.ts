import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentSecurityPolicy, nonce } from '../../middleware';

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

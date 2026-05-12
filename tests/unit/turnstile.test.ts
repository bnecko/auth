import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from '@/lib/server/turnstile';

const SECRET = 'turnstile-secret-test';

describe('verifyTurnstile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function mockFetch(impl: typeof fetch) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl);
  }

  it('returns true when Turnstile reports success', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', SECRET);
    mockFetch(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect(await verifyTurnstile('valid-token', '1.2.3.4')).toBe(true);
  });

  it('returns false when Turnstile reports success=false', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', SECRET);
    mockFetch(async () =>
      new Response(
        JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }),
        { status: 200 },
      ),
    );
    expect(await verifyTurnstile('bad-token', '1.2.3.4')).toBe(false);
  });

  it('returns false when no token is supplied', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', SECRET);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyTurnstile(undefined, '1.2.3.4')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails open in non-production when secret is missing', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'development');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await verifyTurnstile('any', '1.2.3.4')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws in production when secret is missing', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(verifyTurnstile('any', '1.2.3.4')).rejects.toThrow(/turnstile is not configured/i);
  });

  it('returns false when Turnstile responds non-2xx', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', SECRET);
    mockFetch(async () => new Response('upstream error', { status: 502 }));
    expect(await verifyTurnstile('valid-token', '1.2.3.4')).toBe(false);
  });

  it('sends remoteip when present and omits when absent', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', SECRET);
    let captured: FormData | undefined;
    mockFetch(async (_url, init) => {
      captured = init?.body as FormData;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    await verifyTurnstile('valid-token', '');
    expect(captured?.has('remoteip')).toBe(false);

    await verifyTurnstile('valid-token', '5.6.7.8');
    expect(captured?.get('remoteip')).toBe('5.6.7.8');
  });
});

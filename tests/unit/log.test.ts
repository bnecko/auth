import { describe, it, expect } from 'vitest';
import { _redactForTests } from '@/lib/server/log';

describe('log redaction', () => {
  it('redacts secret-ish keys recursively, leaves others intact', () => {
    const out = _redactForTests({
      userId: 1,
      password: 'p',
      nested: { authToken: 'x', ok: 2 },
      list: [{ secret: 's' }, { plain: 'keep' }],
    });
    expect(out).toEqual({
      userId: 1,
      password: '[redacted]',
      nested: { authToken: '[redacted]', ok: 2 },
      list: [{ secret: '[redacted]' }, { plain: 'keep' }],
    });
  });

  it('serializes an Error with the fields needed to diagnose it', () => {
    const serialized = _redactForTests(new Error('boom')) as Record<string, unknown>;
    expect(serialized.name).toBe('Error');
    expect(serialized.message).toBe('boom');
    expect(serialized.stack).toContain('boom');
    expect(serialized).not.toHaveProperty('code');
    expect(serialized).not.toHaveProperty('cause');
  });

  it('keeps a string error code and redacts secrets inside the cause', () => {
    const err = new Error('fetch failed', { cause: { token: 'sk-live', host: 'api.example.com' } });
    (err as { code?: string }).code = 'ECONNRESET';

    const serialized = _redactForTests(err) as Record<string, unknown>;
    expect(serialized.code).toBe('ECONNRESET');
    expect(serialized.cause).toEqual({ token: '[redacted]', host: 'api.example.com' });
  });

  it('passes primitives through', () => {
    expect(_redactForTests('hello')).toBe('hello');
    expect(_redactForTests(42)).toBe(42);
    expect(_redactForTests(null)).toBe(null);
  });
});

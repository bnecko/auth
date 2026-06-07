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

  it('serializes Error to name and message only', () => {
    expect(_redactForTests(new Error('boom'))).toEqual({ name: 'Error', message: 'boom' });
  });

  it('passes primitives through', () => {
    expect(_redactForTests('hello')).toBe('hello');
    expect(_redactForTests(42)).toBe(42);
    expect(_redactForTests(null)).toBe(null);
  });
});

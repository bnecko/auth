import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/server/password';

describe('password hashing', () => {
  it('verifies a matching password', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', encoded)).toBe(true);
  });

  it('rejects a mismatched password', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', encoded)).toBe(false);
  });

  it('salts each hash uniquely', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
    // Both still verify
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('same-password', b)).toBe(true);
  });

  it('rejects a malformed encoded hash', async () => {
    expect(await verifyPassword('whatever', 'not-a-valid-hash')).toBe(false);
    expect(await verifyPassword('whatever', '')).toBe(false);
    expect(await verifyPassword('whatever', 'bcrypt$1$salt$hash')).toBe(false);
  });

  it('rejects when the hash component is tampered', async () => {
    const encoded = await hashPassword('original');
    const parts = encoded.split('$');
    // Flip the first char of the hash. Tampering the last char can be a
    // no-op when it only flips base64url "padding" bits that decode to
    // the same byte sequence; the first char always maps to real bytes.
    const hash = parts[5];
    parts[5] = (hash.startsWith('A') ? 'B' : 'A') + hash.slice(1);
    const tampered = parts.join('$');
    expect(await verifyPassword('original', tampered)).toBe(false);
  });

  it('encodes the scrypt cost parameters in the output', async () => {
    const encoded = await hashPassword('any');
    const [algorithm, cost, blockSize, parallelization] = encoded.split('$');
    expect(algorithm).toBe('scrypt');
    expect(Number(cost)).toBeGreaterThan(0);
    expect(Number(blockSize)).toBeGreaterThan(0);
    expect(Number(parallelization)).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { randomToken, publicId, hashToken, safeEqual, normalizeIdentifier, telegramStartToken } from '@/lib/server/crypto';

describe('crypto utils', () => {
  describe('randomToken', () => {
    it('generates a string of the expected length', () => {
      // 32 bytes in base64url is usually ~43 characters
      const token = randomToken(32);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(32);
    });

    it('generates unique tokens', () => {
      const token1 = randomToken(32);
      const token2 = randomToken(32);
      expect(token1).not.toBe(token2);
    });
  });

  describe('publicId', () => {
    it('generates an ID with the given prefix', () => {
      const id = publicId('usr');
      expect(id.startsWith('usr_')).toBe(true);
    });

    it('generates unique IDs', () => {
      const id1 = publicId('req');
      const id2 = publicId('req');
      expect(id1).not.toBe(id2);
    });
  });

  describe('hashToken', () => {
    it('generates a consistent hex hash', () => {
      const hash1 = hashToken('hello');
      const hash2 = hashToken('hello');
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 is 64 hex characters
    });

    it('generates different hashes for different inputs', () => {
      const hash1 = hashToken('hello');
      const hash2 = hashToken('world');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('safeEqual', () => {
    it('returns true for equal strings', () => {
      expect(safeEqual('password123', 'password123')).toBe(true);
    });

    it('returns false for different strings of same length', () => {
      expect(safeEqual('password123', 'password124')).toBe(false);
    });

    it('returns false for strings of different length', () => {
      expect(safeEqual('password', 'password123')).toBe(false);
    });
  });

  describe('normalizeIdentifier', () => {
    it('trims and lowercases input', () => {
      expect(normalizeIdentifier('  UserNAME  ')).toBe('username');
      expect(normalizeIdentifier('Test@Example.com')).toBe('test@example.com');
    });
  });

  describe('telegramStartToken', () => {
    it('generates a unique token for telegram start links', () => {
      const t1 = telegramStartToken();
      const t2 = telegramStartToken();
      expect(t1).not.toBe(t2);
      expect(t1.length).toBeGreaterThan(0);
    });
  });
});

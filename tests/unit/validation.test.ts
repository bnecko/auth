import { describe, it, expect } from 'vitest';
import { parseRegistrationInput, parseLoginInput, parseScopes } from '@/lib/server/validation';

describe('validation utils', () => {
  describe('parseRegistrationInput', () => {
    it('validates a correct payload', () => {
      const payload = {
        firstName: 'John',
        username: 'john_doe',
        email: 'john@example.com',
        password: 'superSecretPassword123!',
      };

      const result = parseRegistrationInput(payload);
      expect(result.errors).toEqual({});
      expect(result.input.firstName).toBe('John');
      expect(result.input.username).toBe('john_doe');
      expect(result.input.email).toBe('john@example.com');
      expect(result.input.password).toBe('superSecretPassword123!');
    });

    it('returns errors for missing or short fields', () => {
      const payload = {
        firstName: '',
        username: 'ab', // too short
        email: 'not-an-email',
        password: 'short', // too short
      };

      const result = parseRegistrationInput(payload);
      expect(result.errors).toHaveProperty('firstName');
      expect(result.errors).toHaveProperty('username');
      expect(result.errors).toHaveProperty('email');
      expect(result.errors).toHaveProperty('password');
    });

    it('returns an error for passwords over 256 characters (anti-DoS)', () => {
      const payload = {
        firstName: 'John',
        username: 'john_doe',
        email: 'john@example.com',
        password: 'a'.repeat(257),
      };

      const result = parseRegistrationInput(payload);
      expect(result.errors).toHaveProperty('password', 'password must be 10-256 characters');
    });

    it('normalizes username and email', () => {
      const payload = {
        firstName: 'John',
        username: ' John_Doe ',
        email: ' John@EXAMPLE.com ',
        password: 'superSecretPassword123!',
      };

      const result = parseRegistrationInput(payload);
      expect(result.input.username).toBe('john_doe');
      expect(result.input.email).toBe('john@example.com');
    });
  });

  describe('parseLoginInput', () => {
    it('validates a correct login payload', () => {
      const payload = {
        identifier: ' John_Doe ',
        password: 'password123!',
        remember: 'on'
      };

      const result = parseLoginInput(payload);
      expect(result.errors).toEqual({});
      expect(result.input.identifier).toBe('john_doe'); // normalized
      expect(result.input.remember).toBe(true);
    });

    it('fails if fields are missing', () => {
      const payload = {
        identifier: '',
      };
      
      const result = parseLoginInput(payload);
      expect(result.errors.form).toBe('invalid credentials');
    });
  });

  describe('parseScopes', () => {
    it('returns default scope if no scopes provided', () => {
      expect(parseScopes(undefined)).toEqual(['profile:read']);
      expect(parseScopes('')).toEqual(['profile:read']);
    });

    it('parses an array of valid scopes', () => {
      const result = parseScopes(['profile:read', 'email:read']);
      expect(result).toEqual(['profile:read', 'email:read']);
    });

    it('parses a comma-separated string of valid scopes', () => {
      const result = parseScopes('profile:read, email:read');
      expect(result).toEqual(['profile:read', 'email:read']);
    });

    it('throws an error for unknown scopes (anti scope-smuggling)', () => {
      expect(() => parseScopes(['profile:read', 'admin:write'])).toThrow('unknown scope: admin:write');
      expect(() => parseScopes('profile:read, malicious:scope')).toThrow('unknown scope: malicious:scope');
    });
  });
});

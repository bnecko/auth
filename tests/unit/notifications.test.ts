import { describe, it, expect, vi } from 'vitest';

// Avoid instantiating the real ioredis client at import time; the pure
// message builder under test touches neither Redis nor the DB.
vi.mock('@/lib/server/redis', () => ({ default: {} }));

import {
  notificationMessage,
  isAllowedByPrefs,
  type UserNotification,
} from '@/lib/server/notifications';

// The receipt types that carry no extra fields (signin_alert needs `method`).
const TYPES = [
  'password_changed',
  'password_reset_completed',
  'login_failure_threshold',
] as const satisfies UserNotification['type'][];

describe('notificationMessage', () => {
  it('returns a non-empty plain-text message for every notification type', () => {
    for (const type of TYPES) {
      const message = notificationMessage({ type });
      expect(message.length).toBeGreaterThan(10);
      // Messages are plain text now - no markup.
      expect(message).not.toContain('<b>');
    }
  });

  it('distinguishes the message per type', () => {
    const messages = new Set(TYPES.map(type => notificationMessage({ type })));
    expect(messages.size).toBe(TYPES.length);
  });

  it('includes the method and IP in a sign-in alert', () => {
    const message = notificationMessage({ type: 'signin_alert', method: 'passkey', ip: '1.2.3.4' });
    expect(message).toContain('passkey');
    expect(message).toContain('1.2.3.4');
    expect(message).not.toContain('<b>');
  });

  it('omits the IP line when no IP is known', () => {
    const message = notificationMessage({ type: 'signin_alert', method: 'passkey' });
    expect(message).toContain('passkey');
    expect(message).not.toContain('IP:');
  });
});

describe('isAllowedByPrefs', () => {
  it('gates security receipts on notifySecurityReceipts (not sign-in alerts)', () => {
    const off = { notifySecurityReceipts: false, notifySigninAlerts: true };
    expect(isAllowedByPrefs(off, 'password_changed')).toBe(false);
    expect(isAllowedByPrefs(off, 'login_failure_threshold')).toBe(false);
    expect(isAllowedByPrefs(off, 'signin_alert')).toBe(true);
  });

  it('gates sign-in alerts on notifySigninAlerts (not security receipts)', () => {
    const off = { notifySecurityReceipts: true, notifySigninAlerts: false };
    expect(isAllowedByPrefs(off, 'signin_alert')).toBe(false);
    expect(isAllowedByPrefs(off, 'password_changed')).toBe(true);
  });
});

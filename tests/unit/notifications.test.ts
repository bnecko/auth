import { describe, it, expect, vi } from 'vitest';

// Avoid instantiating the real ioredis client at import time; the pure
// message builder under test touches neither Redis nor the DB.
vi.mock('@/lib/server/redis', () => ({ default: {} }));

import { notificationMessage, type UserNotification } from '@/lib/server/notifications';

const TYPES: UserNotification['type'][] = [
  'password_changed',
  'password_reset_completed',
  'login_failure_threshold',
];

describe('notificationMessage', () => {
  it('returns a non-empty HTML message for every notification type', () => {
    for (const type of TYPES) {
      const message = notificationMessage({ type });
      expect(message.length).toBeGreaterThan(10);
      expect(message).toContain('<b>');
    }
  });

  it('distinguishes the message per type', () => {
    const messages = new Set(TYPES.map(type => notificationMessage({ type })));
    expect(messages.size).toBe(TYPES.length);
  });
});

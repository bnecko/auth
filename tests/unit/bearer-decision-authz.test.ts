import { describe, it, expect, vi } from 'vitest';

// Avoid opening a real ioredis connection at import time.
vi.mock('@/lib/server/redis', () => ({ default: {} }));

// Pin a known configured admin id for the webhook (non-UI) path.
vi.mock('@/lib/server/config', async orig => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, bearerAdminTelegramId: () => '999000' };
});

// Stub the repo so a request that passes authz reaches a clean "not found"
// instead of touching the database.
vi.mock('@/lib/server/repositories/bearerRequests', () => ({
  approveBearerRequest: vi.fn(),
  clearBearerRequestKey: vi.fn(),
  createBearerRequest: vi.fn(),
  findBearerRequestByPublicId: vi.fn(async () => null),
  countPendingBearerRequestsForUser: vi.fn(),
  markBearerRequestRevoked: vi.fn(),
  readBearerRequestPlaintext: vi.fn(),
  rejectBearerRequest: vi.fn(),
}));

import { decideBearerRequest } from '@/lib/server/services/bearer';

describe('decideBearerRequest authorization', () => {
  it('rejects the admin_ui_ sentinel arriving over the non-UI (webhook) path', async () => {
    await expect(
      decideBearerRequest({
        publicId: 'br_x',
        decision: 'approve',
        adminTelegramId: 'admin_ui_42',
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it('rejects a non-admin telegram id over the webhook path', async () => {
    await expect(
      decideBearerRequest({
        publicId: 'br_x',
        decision: 'approve',
        adminTelegramId: 'attacker',
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it('accepts the configured admin id over the webhook path (passes authz)', async () => {
    // Past the authz gate it hits the stubbed repo and fails with "not found",
    // proving the gate let it through rather than blocking on authorization.
    await expect(
      decideBearerRequest({
        publicId: 'br_x',
        decision: 'approve',
        adminTelegramId: '999000',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('lets the in-process admin UI through without an id check', async () => {
    await expect(
      decideBearerRequest({
        publicId: 'br_x',
        decision: 'approve',
        adminTelegramId: 'admin_ui_42',
        viaAdminUi: true,
      }),
    ).rejects.toThrow(/not found/i);
  });
});

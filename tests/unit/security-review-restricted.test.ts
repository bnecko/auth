import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/server/http', () => ({ requestContextFromHeaders: () => ({ ip: '', userAgent: '', country: '' }) }));

const getCurrentSession = vi.fn();
vi.mock('@/lib/server/session', () => ({
  getCurrentSession: (...a: unknown[]) => getCurrentSession(...a),
  // Faithful to the real guard: a restricted user is bounced to /restricted.
  assertNotRestricted: (s: { user: { restricted: boolean } }) => {
    if (s.user.restricted) {
      throw new Error('REDIRECT:/restricted');
    }
  },
}));

// Role checks pass: the point is that role alone must not be enough.
vi.mock('@/lib/server/supporterAuth', () => ({
  canHandleSecurity: vi.fn(async () => true),
  canRestrict: vi.fn(async () => true),
}));

const restrictUser = vi.fn();
const setSuspicionStatus = vi.fn();
vi.mock('@/lib/server/services/restrictions', () => ({
  restrictUser: (...a: unknown[]) => restrictUser(...a),
  unrestrictUser: vi.fn(),
  getRestrictionForReview: vi.fn(),
  postSecurityReply: vi.fn(),
}));
vi.mock('@/lib/server/repositories/users', () => ({ findUserByIdentifier: vi.fn(async () => ({ id: 5 })) }));
vi.mock('@/lib/server/repositories/suspicion', () => ({ setSuspicionStatus: (...a: unknown[]) => setSuspicionStatus(...a) }));

import { restrictManualAction, dismissSuspicionAction } from '@/app/(app)/security-review/actions';

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe('security-review actions reject a restricted actor', () => {
  beforeEach(() => {
    restrictUser.mockReset();
    setSuspicionStatus.mockReset();
  });

  it('restrictManualAction bounces a restricted security_high supporter before mutating', async () => {
    getCurrentSession.mockResolvedValue({ user: { id: 1, restricted: true } });
    await expect(restrictManualAction(form({ username: 'victim' }))).rejects.toThrow('REDIRECT:/restricted');
    expect(restrictUser).not.toHaveBeenCalled();
  });

  it('dismissSuspicionAction bounces a restricted security supporter before mutating', async () => {
    getCurrentSession.mockResolvedValue({ user: { id: 1, restricted: true } });
    await expect(dismissSuspicionAction(form({ suspicionId: 's1' }))).rejects.toThrow('REDIRECT:/restricted');
    expect(setSuspicionStatus).not.toHaveBeenCalled();
  });

  it('lets an unrestricted supporter through', async () => {
    getCurrentSession.mockResolvedValue({ user: { id: 1, restricted: false } });
    await dismissSuspicionAction(form({ suspicionId: 's1' }));
    expect(setSuspicionStatus).toHaveBeenCalledOnce();
  });
});

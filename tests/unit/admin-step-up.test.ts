import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/session', () => ({
  getCurrentSession: vi.fn(),
  getSessionFromRequest: vi.fn(),
}));
vi.mock('@/lib/server/adminStepUp', () => ({
  isAdminStepUpVerified: vi.fn(),
}));

import { requireAdminStepUp, requireAdminStepUpSession } from '@/lib/server/apiAuth';
import { getCurrentSession, getSessionFromRequest } from '@/lib/server/session';
import { isAdminStepUpVerified } from '@/lib/server/adminStepUp';

const mockGetCurrentSession = vi.mocked(getCurrentSession);
const mockGetSessionFromRequest = vi.mocked(getSessionFromRequest);
const mockStepUp = vi.mocked(isAdminStepUpVerified);

const dummyReq = {} as Parameters<typeof requireAdminStepUp>[0];

describe('requireAdminStepUpSession (server-action transport)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when there is no session', async () => {
    mockGetCurrentSession.mockResolvedValue(null);
    await expect(requireAdminStepUpSession()).rejects.toThrow('forbidden');
    expect(mockStepUp).not.toHaveBeenCalled();
  });

  it('throws when the user is not an admin', async () => {
    mockGetCurrentSession.mockResolvedValue({ user: { id: 1, role: 'user' } } as never);
    await expect(requireAdminStepUpSession()).rejects.toThrow('forbidden');
    expect(mockStepUp).not.toHaveBeenCalled();
  });

  it('throws when an admin has not completed step-up', async () => {
    mockGetCurrentSession.mockResolvedValue({ user: { id: 7, role: 'admin' } } as never);
    mockStepUp.mockResolvedValue(false);
    await expect(requireAdminStepUpSession()).rejects.toThrow('admin step-up required');
    expect(mockStepUp).toHaveBeenCalledWith(7);
  });

  it('returns the session for an admin with a live step-up grant', async () => {
    const session = { user: { id: 7, role: 'admin' } };
    mockGetCurrentSession.mockResolvedValue(session as never);
    mockStepUp.mockResolvedValue(true);
    await expect(requireAdminStepUpSession()).resolves.toBe(session);
  });
});

describe('requireAdminStepUp (request transport)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when an admin has not completed step-up', async () => {
    mockGetSessionFromRequest.mockResolvedValue({
      user: { id: 7, role: 'admin', status: 'active' },
    } as never);
    mockStepUp.mockResolvedValue(false);
    const result = await requireAdminStepUp(dummyReq);
    expect(result.response?.status).toBe(403);
    expect(result.session).toBeNull();
  });

  it('returns 403 for a non-admin user', async () => {
    mockGetSessionFromRequest.mockResolvedValue({
      user: { id: 1, role: 'user', status: 'active' },
    } as never);
    const result = await requireAdminStepUp(dummyReq);
    expect(result.response?.status).toBe(403);
    expect(mockStepUp).not.toHaveBeenCalled();
  });

  it('passes through for an admin with a live step-up grant', async () => {
    const session = { user: { id: 7, role: 'admin', status: 'active' } };
    mockGetSessionFromRequest.mockResolvedValue(session as never);
    mockStepUp.mockResolvedValue(true);
    const result = await requireAdminStepUp(dummyReq);
    expect(result.response).toBeNull();
    expect(result.session).toBe(session);
  });
});

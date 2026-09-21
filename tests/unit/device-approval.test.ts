import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const getCurrentSession = vi.fn();
vi.mock('@/lib/server/session', () => ({
  getCurrentSession: (...a: unknown[]) => getCurrentSession(...a),
  // Faithful to the real guard: a restricted user is bounced to /restricted.
  assertNotRestricted: (s: { user: { restricted: boolean } }) => {
    if (s.user.restricted) throw new Error('REDIRECT:/restricted');
  },
}));

const findDeviceCodeByUserCode = vi.fn();
const updateDeviceCodeStatus = vi.fn();
const createDeviceCode = vi.fn();
vi.mock('@/lib/server/repositories/oauth', () => ({
  findDeviceCodeByUserCode: (...a: unknown[]) => findDeviceCodeByUserCode(...a),
  updateDeviceCodeStatus: (...a: unknown[]) => updateDeviceCodeStatus(...a),
  createDeviceCode: (...a: unknown[]) => createDeviceCode(...a),
}));

const upsertAuthorization = vi.fn();
vi.mock('@/lib/server/repositories/authorizations', () => ({
  upsertAuthorization: (...a: unknown[]) => upsertAuthorization(...a),
}));

vi.mock('@/lib/server/rateLimit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/services/oauth', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/server/services/oauth')>()),
  authenticateClient: vi.fn(async () => ({ id: 7 })),
  enforceClientGrant: vi.fn(),
  enforceClientScopes: vi.fn(),
}));
vi.mock('@/lib/server/redis', () => ({ default: {} }));

import { approveCodeAction, denyCodeAction } from '@/app/device/actions';
import { POST as requestDeviceCode } from '@/app/api/oauth/device/code/route';

const form = (userCode: string) => {
  const fd = new FormData();
  fd.set('user_code', userCode);
  return fd;
};

const pendingCode = { appId: 42, scopes: ['profile:read', 'email:read'], status: 'pending' };

beforeEach(() => {
  for (const mock of [getCurrentSession, findDeviceCodeByUserCode, updateDeviceCodeStatus, upsertAuthorization, createDeviceCode]) {
    mock.mockReset();
  }
});

describe('device approval', () => {
  // These used to be closures in the page and acted as whoever had loaded it,
  // so a replayed submit still approved after that user had signed out.
  it('acts as whoever is signed in when it runs, and as nobody otherwise', async () => {
    getCurrentSession.mockResolvedValue(null);

    await expect(approveCodeAction(form('ABCD-EFGH'))).rejects.toThrow('REDIRECT:/login');
    await expect(denyCodeAction(form('ABCD-EFGH'))).rejects.toThrow('REDIRECT:/login');
    expect(updateDeviceCodeStatus).not.toHaveBeenCalled();
  });

  it('refuses a restricted user', async () => {
    getCurrentSession.mockResolvedValue({ user: { id: 1, restricted: true } });

    await expect(approveCodeAction(form('ABCD-EFGH'))).rejects.toThrow('REDIRECT:/restricted');
    expect(updateDeviceCodeStatus).not.toHaveBeenCalled();
  });

  // Without the authorization row the grant lives only as tokens: nothing
  // shows under connected apps, so there is nothing for the user to revoke.
  it('records a revocable grant, with the app and scopes from the code and not the form', async () => {
    getCurrentSession.mockResolvedValue({ user: { id: 5, restricted: false } });
    findDeviceCodeByUserCode.mockResolvedValue(pendingCode);
    updateDeviceCodeStatus.mockResolvedValue(true);
    const submitted = form('abcd-efgh');
    submitted.set('scopes', 'billing:charge');
    submitted.set('appId', '999');

    await expect(approveCodeAction(submitted)).rejects.toThrow('REDIRECT:/device?success=true');

    expect(updateDeviceCodeStatus).toHaveBeenCalledWith('ABCD-EFGH', 'approved', 5);
    expect(upsertAuthorization).toHaveBeenCalledWith({ userId: 5, appId: 42, scopes: ['profile:read', 'email:read'] });
  });

  it('records nothing when the code was no longer pending', async () => {
    getCurrentSession.mockResolvedValue({ user: { id: 5, restricted: false } });
    findDeviceCodeByUserCode.mockResolvedValue(pendingCode);
    updateDeviceCodeStatus.mockResolvedValue(false);

    await expect(approveCodeAction(form('ABCD-EFGH'))).rejects.toThrow('REDIRECT:/device?user_code=ABCD-EFGH');
    expect(upsertAuthorization).not.toHaveBeenCalled();
  });
});

describe('device code request', () => {
  const request = (scope: string) =>
    requestDeviceCode(
      new NextRequest('http://localhost/api/oauth/device/code', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: 'app', scope }).toString(),
      }),
    );

  // Approval is one click on a typed code, often at the prompting of whoever
  // sent the link. That is too little ceremony for permission to move money.
  it('cannot ask for permission to charge', async () => {
    const res = await request('profile:read billing:charge');

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_scope' });
    expect(createDeviceCode).not.toHaveBeenCalled();
  });

  it('still issues a code for ordinary scopes', async () => {
    const res = await request('profile:read');

    expect(res.status).toBe(200);
    expect(createDeviceCode).toHaveBeenCalledOnce();
  });
});

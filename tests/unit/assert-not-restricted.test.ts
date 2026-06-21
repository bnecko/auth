import { describe, it, expect, vi } from 'vitest';

// session.ts pulls repositories that open redis/db at import; stub them.
vi.mock('@/lib/server/redis', () => ({ default: {} }));
vi.mock('@/lib/server/db', () => ({ query: vi.fn(), queryOne: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { assertNotRestricted } from '@/lib/server/session';

const session = (restricted: boolean) =>
  ({ session: { id: 1 }, user: { id: 1, restricted } }) as never;

describe('assertNotRestricted', () => {
  it('redirects a restricted user to /restricted', () => {
    expect(() => assertNotRestricted(session(true))).toThrow(/REDIRECT:\/restricted/);
  });

  it('lets an active user through', () => {
    expect(() => assertNotRestricted(session(false))).not.toThrow();
  });
});

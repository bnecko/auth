import { describe, expect, it, vi } from 'vitest';
import { hashPassword } from '@/lib/server/password';

const PASSWORD = 'correct horse battery';
const stored = await hashPassword(PASSWORD);

vi.mock('@/lib/server/repositories/users', () => ({
  findPasswordHashById: vi.fn(async (id: number) => (id === 1 ? { password_hash: stored } : null)),
}));

import { isCurrentPassword } from '@/lib/server/reauth';

describe('isCurrentPassword', () => {
  it('accepts the account password', async () => {
    expect(await isCurrentPassword(1, PASSWORD)).toBe(true);
  });

  it('refuses a wrong one', async () => {
    expect(await isCurrentPassword(1, 'correct horse')).toBe(false);
  });

  // A form that leaves the field out must not read as a match.
  it('refuses an empty one without looking the user up', async () => {
    expect(await isCurrentPassword(1, '')).toBe(false);
  });

  it('refuses for an account that does not exist', async () => {
    expect(await isCurrentPassword(2, PASSWORD)).toBe(false);
  });
});

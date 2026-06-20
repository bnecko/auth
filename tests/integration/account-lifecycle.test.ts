import { describe, expect, it } from 'vitest';
import { queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import {
  deactivateAccount,
  clearAccountDormancy,
  findUserById,
} from '@/lib/server/repositories/users';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUserId(prefix = 'life') {
  const token = randomToken(6);
  const username = `${prefix}_${token}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'LifeTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed user');
  return Number(row.id);
}

describeDb('account lifecycle', () => {
  it('deactivate sets the flag and a sign-in clears it', async () => {
    const id = await seedUserId();
    const deactivated = await deactivateAccount(id);
    expect(deactivated?.deactivatedAt).toBeTruthy();

    const cleared = await clearAccountDormancy(id);
    expect(cleared).toEqual({ wasDeactivated: true, wasPendingDeletion: false });

    const after = await findUserById(id);
    expect(after?.deactivatedAt).toBeNull();
  });

  it('clearAccountDormancy is a no-op for an active account', async () => {
    const id = await seedUserId();
    expect(await clearAccountDormancy(id)).toBeNull();
  });

  it('cancels a pending deletion on sign-in', async () => {
    const id = await seedUserId();
    await queryOne(
      `update users set deletion_requested_at = now() where id = $1 returning id`,
      [id],
    );
    const cleared = await clearAccountDormancy(id);
    expect(cleared).toEqual({ wasDeactivated: false, wasPendingDeletion: true });

    const after = await findUserById(id);
    expect(after?.deletionRequestedAt).toBeNull();
  });
});

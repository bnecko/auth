import { describe, expect, it } from 'vitest';
import { queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import {
  createWebauthnCredential,
  deleteWebauthnCredential,
  findWebauthnCredentialById,
  findWebauthnCredentialsByUser,
  updateWebauthnCredentialSignCount,
} from '@/lib/server/repositories/webauthn';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUser() {
  const username = `wa_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'WaTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed user');
  return Number(row.id);
}

function fakePublicKey() {
  // 64-byte deterministic blob; real WebAuthn public keys are COSE/CBOR
  // encoded, but the repo treats this column as opaque bytes.
  return new Uint8Array(64).fill(0x42);
}

describeDb('webauthn repository', () => {
  it('creates a credential and reads it back', async () => {
    const userId = await seedUser();
    const credentialId = `cred_${randomToken(16)}`;
    const created = await createWebauthnCredential({
      userId,
      credentialId,
      publicKey: fakePublicKey(),
      signCount: 0,
      transports: ['internal'],
      name: 'macbook-touchid',
    });
    expect(created.credentialId).toBe(credentialId);
    expect(created.signCount).toBe(0);
    expect(created.transports).toEqual(['internal']);

    const found = await findWebauthnCredentialById(credentialId);
    expect(found?.userId).toBe(userId);
    expect(found?.name).toBe('macbook-touchid');
  });

  it('findWebauthnCredentialsByUser returns only that user’s credentials', async () => {
    const userA = await seedUser();
    const userB = await seedUser();
    const a1 = `cred_${randomToken(16)}`;
    const a2 = `cred_${randomToken(16)}`;
    const b1 = `cred_${randomToken(16)}`;
    await createWebauthnCredential({ userId: userA, credentialId: a1, publicKey: fakePublicKey(), signCount: 0, transports: ['internal'], name: 'a1' });
    await createWebauthnCredential({ userId: userA, credentialId: a2, publicKey: fakePublicKey(), signCount: 0, transports: ['internal'], name: 'a2' });
    await createWebauthnCredential({ userId: userB, credentialId: b1, publicKey: fakePublicKey(), signCount: 0, transports: ['internal'], name: 'b1' });

    const aRows = await findWebauthnCredentialsByUser(userA);
    const aIds = aRows.map(r => r.credentialId);
    expect(aIds).toContain(a1);
    expect(aIds).toContain(a2);
    expect(aIds).not.toContain(b1);
  });

  it('updateWebauthnCredentialSignCount bumps counter and last_used_at', async () => {
    const userId = await seedUser();
    const credentialId = `cred_${randomToken(16)}`;
    await createWebauthnCredential({ userId, credentialId, publicKey: fakePublicKey(), signCount: 0, transports: ['internal'], name: 'n' });
    const before = await findWebauthnCredentialById(credentialId);
    await new Promise(r => setTimeout(r, 20));
    await updateWebauthnCredentialSignCount(credentialId, 7);
    const after = await findWebauthnCredentialById(credentialId);
    expect(after?.signCount).toBe(7);
    expect(after?.lastUsedAt).not.toBe(before?.lastUsedAt);
  });

  it('deleteWebauthnCredential is dual-keyed by userId', async () => {
    const userA = await seedUser();
    const userB = await seedUser();
    const credentialId = `cred_${randomToken(16)}`;
    await createWebauthnCredential({ userId: userA, credentialId, publicKey: fakePublicKey(), signCount: 0, transports: ['internal'], name: 'k' });

    // Wrong user: no-op, returns false, row still present
    const wrongResult = await deleteWebauthnCredential(credentialId, userB);
    expect(wrongResult).toBe(false);
    expect(await findWebauthnCredentialById(credentialId)).not.toBeNull();

    // Right user: deletes, returns true
    const rightResult = await deleteWebauthnCredential(credentialId, userA);
    expect(rightResult).toBe(true);
    expect(await findWebauthnCredentialById(credentialId)).toBeNull();
  });
});

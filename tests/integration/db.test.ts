import { describe, it, expect } from 'vitest';
import { createUser, findUserByIdentifier, updateUserPassword, findPasswordHash } from '@/lib/server/repositories/users';
import { randomToken, publicId } from '@/lib/server/crypto';

// These tests require a running test database connected via DATABASE_URL
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Database Integration: users repository', () => {
  it('creates and finds a user', async () => {
    const username = `testuser_${randomToken(8)}`;
    const email = `${username}@example.com`;
    
    // Create user
    const user = await createUser({
      publicId: publicId('usr'),
      firstName: 'Test',
      username,
      bio: 'Test Bio',
      email,
      dob: '1990-01-01',
      passwordHash: 'testhash',
    });
    expect(user.id).toBeTypeOf('number');
    expect(user.username).toBe(username);
    expect(user.email).toBe(email);
    expect(user.status).toBe('active');

    // Find by identifier
    const foundByEmail = await findUserByIdentifier(email);
    expect(foundByEmail?.id).toBe(user.id);

    const foundByUsername = await findUserByIdentifier(username);
    expect(foundByUsername?.id).toBe(user.id);
  });

  it('updates a user password', async () => {
    const username = `pwdtest_${randomToken(8)}`;
    const email = `${username}@example.com`;
    
    const user = await createUser({
      publicId: publicId('usr'),
      firstName: 'PwdTest',
      username,
      bio: null,
      email,
      dob: null,
      passwordHash: 'oldhash',
    });

    // Check old hash
    const oldRecord = await findPasswordHash(email);
    expect(oldRecord?.password_hash).toBe('oldhash');

    // Update password
    await updateUserPassword(user.id, 'newhash');

    // Check new hash
    const newRecord = await findPasswordHash(email);
    expect(newRecord?.password_hash).toBe('newhash');
  });

  it('fails gracefully when finding non-existent users', async () => {
    const found = await findUserByIdentifier('nonexistent@example.com');
    expect(found).toBeNull();
  });
});

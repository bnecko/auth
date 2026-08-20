import { describe, expect, it } from 'vitest';
import { queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import {
  findExternalAppByApiKey,
  findExternalAppSecretHashForOwner,
  rotateExternalAppApiKey,
  rotateExternalAppOAuthSecret,
  verifyExternalAppClientSecret,
} from '@/lib/server/repositories/externalApps';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUser() {
  const username = `cred_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'CredTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed user');
  return Number(row.id);
}

// Mirrors the pre-split state migration 005 left behind: one secret hashed
// into both api_key_hash and oauth_client_secret_hash.
async function seedSharedCredentialApp(sharedSecret: string, ownerUserId?: number) {
  const suffix = randomToken(6);
  const row = await queryOne<{ id: string }>(
    `insert into external_apps (public_id, name, slug, owner_user_id, api_key_hash, oauth_client_secret_hash)
     values ($1, $2, $3, $4, $5, $5)
     returning id`,
    [`app_cred_${suffix}`, 'Cred Test', `cred-${suffix}`, ownerUserId ?? null, hashToken(sharedSecret)],
  );
  if (!row) throw new Error('failed to seed app');
  return Number(row.id);
}

async function seedIndependentCredentialApp(apiKey: string, clientSecret: string, ownerUserId: number) {
  const suffix = randomToken(6);
  const row = await queryOne<{ id: string }>(
    `insert into external_apps (public_id, name, slug, owner_user_id, api_key_hash, oauth_client_secret_hash)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [`app_cred_${suffix}`, 'Cred Test', `cred-${suffix}`, ownerUserId, hashToken(apiKey), hashToken(clientSecret)],
  );
  if (!row) throw new Error('failed to seed app');
  return Number(row.id);
}

describeDb('external app credential rotation', () => {
  it('rotating the api key immediately invalidates the old key', async () => {
    const oldKey = `sec_${randomToken(32)}`;
    const appId = await seedSharedCredentialApp(oldKey);

    expect((await findExternalAppByApiKey(oldKey))?.id).toBe(appId);

    const newKey = `sec_${randomToken(32)}`;
    await rotateExternalAppApiKey(appId, newKey);

    expect(await findExternalAppByApiKey(oldKey)).toBeNull();
    expect((await findExternalAppByApiKey(newKey))?.id).toBe(appId);
  });

  it('rotating both secrets on a pre-split app kills the shared credential on the api surface', async () => {
    const shared = `sec_${randomToken(32)}`;
    const appId = await seedSharedCredentialApp(shared);

    // The sequence the rotate_secret action runs for a shared-hash app.
    const newSecret = `sec_${randomToken(32)}`;
    await rotateExternalAppOAuthSecret({
      appId,
      currentSecretHash: hashToken(shared),
      newSecret,
      previousExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const newKey = `sec_${randomToken(32)}`;
    await rotateExternalAppApiKey(appId, newKey);

    // The leaked shared secret must be dead as an api key immediately, while
    // the OAuth surface honors the 7-day grace window by design.
    expect(await findExternalAppByApiKey(shared)).toBeNull();
    const app = await findExternalAppByApiKey(newKey);
    expect(app?.id).toBe(appId);
    const graced = await verifyExternalAppClientSecret(app!.publicId, shared);
    expect(graced?.id).toBe(appId);
    const current = await verifyExternalAppClientSecret(app!.publicId, newSecret);
    expect(current?.id).toBe(appId);
  });

  it('flags a shared credential even after the oauth secret already rotated away from it', async () => {
    const ownerId = await seedUser();
    const shared = `sec_${randomToken(32)}`;
    const appId = await seedSharedCredentialApp(shared, ownerId);

    // A pre-fix rotation: the shared hash moves to the grace table while
    // api_key_hash keeps holding it, so plain hash equality no longer sees
    // the sharing.
    await rotateExternalAppOAuthSecret({
      appId,
      currentSecretHash: hashToken(shared),
      newSecret: `sec_${randomToken(32)}`,
      previousExpiresAt: new Date(Date.now() - 1000),
    });

    const app = await findExternalAppSecretHashForOwner(appId, ownerId);
    expect(app?.api_key_shared_with_oauth).toBe(true);
  });

  it('does not flag independent credentials, and secret rotation leaves the api key working', async () => {
    const ownerId = await seedUser();
    const apiKey = `sec_${randomToken(32)}`;
    const clientSecret = `sec_${randomToken(32)}`;
    const appId = await seedIndependentCredentialApp(apiKey, clientSecret, ownerId);

    const app = await findExternalAppSecretHashForOwner(appId, ownerId);
    expect(app?.api_key_shared_with_oauth).toBe(false);

    await rotateExternalAppOAuthSecret({
      appId,
      currentSecretHash: hashToken(clientSecret),
      newSecret: `sec_${randomToken(32)}`,
      previousExpiresAt: new Date(Date.now() + 60_000),
    });
    expect((await findExternalAppByApiKey(apiKey))?.id).toBe(appId);
  });

  it('refreshes a pending bearer reveal with the new api key', async () => {
    const ownerId = await seedUser();
    const oldKey = `sec_${randomToken(32)}`;
    const appId = await seedSharedCredentialApp(oldKey, ownerId);
    await queryOne(
      `insert into bearer_requests (public_id, user_id, app_name, reason, status, external_app_id, plaintext_key)
       values ($1, $2, 'Cred Test', 'test', 'approved', $3, $4)
       returning id`,
      [publicId('br'), ownerId, appId, oldKey],
    );

    const newKey = `sec_${randomToken(32)}`;
    await rotateExternalAppApiKey(appId, newKey);

    const pending = await queryOne<{ plaintext_key: string }>(
      `select plaintext_key from bearer_requests where external_app_id = $1`,
      [appId],
    );
    expect(pending?.plaintext_key).toBe(newKey);
  });
});

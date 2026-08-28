import { describe, expect, it } from 'vitest';
import { queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import {
  countActiveExternalAppsForOwner,
  deleteExternalAppForOwner,
  setExternalAppFrozenForOwner,
} from '@/lib/server/repositories/externalApps';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUser() {
  const username = `own_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'OwnTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed user');
  return { id: Number(row.id), username };
}

async function seedApp(
  ownerUserId: number,
  status: 'active' | 'frozen' | 'disabled' = 'active',
) {
  const suffix = randomToken(6);
  const row = await queryOne<{ id: string }>(
    `insert into external_apps (public_id, name, slug, owner_user_id, api_key_hash, status)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [`app_own_${suffix}`, 'Own Test', `own-${suffix}`, ownerUserId, `hash_${suffix}`, status],
  );
  if (!row) throw new Error('failed to seed app');
  return Number(row.id);
}

async function appStatus(appId: number) {
  const row = await queryOne<{ status: string }>(
    `select status from external_apps where id = $1`,
    [appId],
  );
  return row?.status ?? null;
}

describeDb('external app owner lifecycle', () => {
  it('freeze and unfreeze flip between active and frozen only', async () => {
    const owner = await seedUser();
    const appId = await seedApp(owner.id);

    const froze = await setExternalAppFrozenForOwner({
      appId,
      ownerUserId: owner.id,
      frozen: true,
    });
    expect(froze?.slug).toBeTruthy();
    expect(await appStatus(appId)).toBe('frozen');

    const thawed = await setExternalAppFrozenForOwner({
      appId,
      ownerUserId: owner.id,
      frozen: false,
    });
    expect(thawed?.slug).toBeTruthy();
    expect(await appStatus(appId)).toBe('active');
  });

  it('refuses freeze transitions for non-owners', async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const appId = await seedApp(owner.id);

    const result = await setExternalAppFrozenForOwner({
      appId,
      ownerUserId: stranger.id,
      frozen: true,
    });
    expect(result).toBeNull();
    expect(await appStatus(appId)).toBe('active');
  });

  it('cannot unfreeze an admin-disabled app', async () => {
    const owner = await seedUser();
    const appId = await seedApp(owner.id, 'disabled');

    const result = await setExternalAppFrozenForOwner({
      appId,
      ownerUserId: owner.id,
      frozen: false,
    });
    expect(result).toBeNull();
    expect(await appStatus(appId)).toBe('disabled');
  });

  it('frozen apps still count toward the active-app cap', async () => {
    const owner = await seedUser();
    await seedApp(owner.id, 'active');
    await seedApp(owner.id, 'frozen');
    await seedApp(owner.id, 'disabled');

    expect(await countActiveExternalAppsForOwner(owner.id)).toBe(2);
  });

  it('delete removes the app, its tokens, and the stashed bearer key', async () => {
    const owner = await seedUser();
    const appId = await seedApp(owner.id);

    await queryOne(
      `insert into oauth_access_tokens (token_hash, external_app_id, user_id, subject, expires_at)
       values ($1, $2, $3, 'usr_test', now() + interval '15 minutes') returning id`,
      [`ath_${randomToken(8)}`, appId, owner.id],
    );
    await queryOne(
      `insert into oauth_refresh_tokens (token_hash, external_app_id, user_id, expires_at)
       values ($1, $2, $3, now() + interval '30 days') returning id`,
      [`rth_${randomToken(8)}`, appId, owner.id],
    );
    const bearer = await queryOne<{ id: string }>(
      `insert into bearer_requests (public_id, user_id, app_name, reason, status, external_app_id, plaintext_key)
       values ($1, $2, 'Own Test', 'test', 'approved', $3, 'sec_stashed') returning id`,
      [publicId('br'), owner.id, appId],
    );

    expect(await deleteExternalAppForOwner(appId, owner.id)).toBe(true);

    expect(await appStatus(appId)).toBeNull();
    const tokens = await queryOne<{ count: string }>(
      `select count(*) as count from oauth_access_tokens where external_app_id = $1`,
      [appId],
    );
    expect(Number(tokens?.count)).toBe(0);
    const refresh = await queryOne<{ count: string }>(
      `select count(*) as count from oauth_refresh_tokens where external_app_id = $1`,
      [appId],
    );
    expect(Number(refresh?.count)).toBe(0);

    // Bearer history survives, but without the app link or the plaintext key.
    const bearerRow = await queryOne<{ external_app_id: string | null; plaintext_key: string | null }>(
      `select external_app_id, plaintext_key from bearer_requests where id = $1`,
      [Number(bearer?.id)],
    );
    expect(bearerRow?.external_app_id).toBeNull();
    expect(bearerRow?.plaintext_key).toBeNull();
  });

  it('refuses delete for non-owners and keeps the stashed key', async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const appId = await seedApp(owner.id);
    const bearer = await queryOne<{ id: string }>(
      `insert into bearer_requests (public_id, user_id, app_name, reason, status, external_app_id, plaintext_key)
       values ($1, $2, 'Own Test', 'test', 'approved', $3, 'sec_stashed') returning id`,
      [publicId('br'), owner.id, appId],
    );

    expect(await deleteExternalAppForOwner(appId, stranger.id)).toBe(false);

    expect(await appStatus(appId)).toBe('active');
    const bearerRow = await queryOne<{ plaintext_key: string | null }>(
      `select plaintext_key from bearer_requests where id = $1`,
      [Number(bearer?.id)],
    );
    expect(bearerRow?.plaintext_key).toBe('sec_stashed');
  });
});

import { describe, expect, it } from 'vitest';
import { queryOne } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import {
  countActiveExternalAppsForOwner,
  listExternalAppsForAdmin,
  setExternalAppStatus,
} from '@/lib/server/repositories/externalApps';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedUser() {
  const username = `adm_${randomToken(6)}`;
  const row = await queryOne<{ id: string }>(
    `insert into users (public_id, first_name, username, username_normalized, email, email_normalized, password_hash, status)
     values ($1, 'AdmTest', $2, lower($2), $3, lower($3), 'testhash', 'active')
     returning id`,
    [publicId('usr'), username, `${username}@example.com`],
  );
  if (!row) throw new Error('failed to seed user');
  return { id: Number(row.id), username };
}

async function seedApp(ownerUserId: number, status: 'active' | 'disabled' = 'active') {
  const suffix = randomToken(6);
  const row = await queryOne<{ id: string }>(
    `insert into external_apps (public_id, name, slug, owner_user_id, api_key_hash, status)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [`app_adm_${suffix}`, 'Adm Test', `adm-${suffix}`, ownerUserId, `hash_${suffix}`, status],
  );
  if (!row) throw new Error('failed to seed app');
  return Number(row.id);
}

describeDb('external app admin controls', () => {
  it('counts only active apps toward the per-user cap', async () => {
    const owner = await seedUser();
    await seedApp(owner.id, 'active');
    await seedApp(owner.id, 'active');
    await seedApp(owner.id, 'disabled');

    expect(await countActiveExternalAppsForOwner(owner.id)).toBe(2);
  });

  it('disable and re-enable flip the status the admin list reports', async () => {
    const owner = await seedUser();
    const appId = await seedApp(owner.id);

    await setExternalAppStatus(appId, 'disabled');
    let listed = (await listExternalAppsForAdmin()).find(app => app.id === appId);
    expect(listed?.status).toBe('disabled');
    expect(listed?.ownerUsername).toBe(owner.username);

    await setExternalAppStatus(appId, 'active');
    listed = (await listExternalAppsForAdmin()).find(app => app.id === appId);
    expect(listed?.status).toBe('active');
  });
});

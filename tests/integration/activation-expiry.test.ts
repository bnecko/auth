import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { queryOne } from '@/lib/server/db';
import { registerWebhookEndpoint } from '@/lib/server/webhooks';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';

const requireCjs = createRequire(import.meta.url);
const worker = requireCjs('../../worker.js') as { sweepExpiredActivations: () => Promise<void> };

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedApp() {
  const token = randomToken(8);
  const row = await queryOne<{ id: string }>(
    `insert into external_apps (public_id, name, slug, api_key_hash, oauth_client_secret_hash, allowed_redirect_urls, status)
     values ($1, 'ActExpiryTest', $2, $3, $3, array['https://example.com/'], 'active')
     returning id`,
    [publicId('app'), `actexp-${token.toLowerCase()}`, hashToken(randomToken(32))],
  );
  if (!row) throw new Error('failed to seed app');
  return Number(row.id);
}

async function seedActivation(appId: number, expiresAt: Date) {
  const row = await queryOne<{ id: string; public_id: string }>(
    `insert into activation_requests (public_id, external_app_id, token_hash, scopes, status, expires_at)
     values ($1, $2, $3, array['profile:read'], 'pending', $4)
     returning id, public_id`,
    [publicId('act'), appId, hashToken(randomToken(32)), expiresAt.toISOString()],
  );
  if (!row) throw new Error('failed to seed activation');
  return { id: Number(row.id), publicId: row.public_id };
}

async function activationStatus(id: number) {
  const row = await queryOne<{ status: string }>(
    `select status from activation_requests where id = $1`,
    [id],
  );
  return row?.status;
}

async function expiredDeliveries(endpointId: number) {
  const row = await queryOne<{ count: number; payload: string | null }>(
    `select count(*)::int as count, max(payload::text) as payload
       from webhook_deliveries
      where webhook_endpoint_id = $1 and event_type = 'activation.expired'`,
    [endpointId],
  );
  return row;
}

describeDb('activation expiry sweep', () => {
  it('expires due activations and enqueues activation.expired for subscribers', async () => {
    const appId = await seedApp();
    const { endpoint } = await registerWebhookEndpoint({
      appId,
      url: 'https://example.com/expired-hook',
      eventTypes: ['activation.expired'],
    });
    const due = await seedActivation(appId, new Date(Date.now() - 60_000));
    const future = await seedActivation(appId, new Date(Date.now() + 60 * 60_000));

    await worker.sweepExpiredActivations();

    expect(await activationStatus(due.id)).toBe('expired');
    expect(await activationStatus(future.id)).toBe('pending');

    const deliveries = await expiredDeliveries(endpoint.id);
    expect(deliveries?.count).toBe(1);
    expect(deliveries?.payload).toContain(due.publicId);
    expect(deliveries?.payload).toContain('"status": "expired"');
  });

  it('expires the activation but enqueues nothing without a subscribed endpoint', async () => {
    const appId = await seedApp();
    const { endpoint } = await registerWebhookEndpoint({
      appId,
      url: 'https://example.com/approved-only',
      eventTypes: ['activation.approved'],
    });
    const due = await seedActivation(appId, new Date(Date.now() - 60_000));

    await worker.sweepExpiredActivations();

    expect(await activationStatus(due.id)).toBe('expired');
    expect((await expiredDeliveries(endpoint.id))?.count).toBe(0);
  });
});

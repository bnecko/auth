import { describe, it, expect } from 'vitest';
import { query, queryOne } from '@/lib/server/db';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';
import {
  enqueueWebhookEvent,
  registerWebhookEndpoint,
} from '@/lib/server/webhooks';
import {
  listActiveWebhookEndpointsForApp,
  disableWebhookEndpoint,
} from '@/lib/server/repositories/webhooks';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function seedApp() {
  const token = randomToken(8);
  const apiKey = randomToken(32);
  const slug = `wh-${token.toLowerCase()}`;
  const row = await queryOne<{ id: string }>(
    `insert into external_apps (
       public_id, name, slug,
       api_key_hash, oauth_client_secret_hash,
       allowed_redirect_urls, status
     )
     values ($1, 'WebhookTest', $2, $3, $3, array['https://example.com/'], 'active')
     returning id`,
    [publicId('app'), slug, hashToken(apiKey)],
  );
  if (!row) throw new Error('failed to seed app');
  return { appId: Number(row.id) };
}

async function countDeliveriesForEndpoint(endpointId: number) {
  const row = await queryOne<{ count: number }>(
    `select count(*)::int as count from webhook_deliveries where webhook_endpoint_id = $1`,
    [endpointId],
  );
  return row?.count ?? 0;
}

describeDb('Webhook endpoint registration', () => {
  it('returns a plaintext secret on registration that persists in the row', async () => {
    const { appId } = await seedApp();
    const { endpoint, secret } = await registerWebhookEndpoint({
      appId,
      url: 'https://example.com/hooks',
      eventTypes: ['activation.approved'],
    });
    expect(secret).toMatch(/^whsec_/);
    expect(endpoint.url).toBe('https://example.com/hooks');
    expect(endpoint.status).toBe('active');

    const stored = await queryOne<{ secret: string }>(
      `select secret from webhook_endpoints where id = $1`,
      [endpoint.id],
    );
    expect(stored?.secret).toBe(secret);
  });
});

describeDb('enqueueWebhookEvent', () => {
  it('creates a delivery row for each matching active endpoint', async () => {
    const { appId } = await seedApp();
    const subscribed = await registerWebhookEndpoint({
      appId,
      url: 'https://example.com/a',
      eventTypes: ['activation.approved'],
    });
    const otherEvent = await registerWebhookEndpoint({
      appId,
      url: 'https://example.com/b',
      eventTypes: ['activation.denied'],
    });
    const disabled = await registerWebhookEndpoint({
      appId,
      url: 'https://example.com/c',
      eventTypes: ['activation.approved'],
    });
    await disableWebhookEndpoint(disabled.endpoint.publicId, appId);

    await enqueueWebhookEvent({
      appId,
      eventType: 'activation.approved',
      payload: { id: 'act_test' },
    });

    expect(await countDeliveriesForEndpoint(subscribed.endpoint.id)).toBe(1);
    expect(await countDeliveriesForEndpoint(otherEvent.endpoint.id)).toBe(0);
    expect(await countDeliveriesForEndpoint(disabled.endpoint.id)).toBe(0);
  });

  it('listActiveWebhookEndpointsForApp excludes disabled endpoints', async () => {
    const { appId } = await seedApp();
    const live = await registerWebhookEndpoint({
      appId,
      url: 'https://example.com/live',
      eventTypes: ['activation.approved'],
    });
    const stopped = await registerWebhookEndpoint({
      appId,
      url: 'https://example.com/stopped',
      eventTypes: ['activation.approved'],
    });
    await disableWebhookEndpoint(stopped.endpoint.publicId, appId);

    const active = await listActiveWebhookEndpointsForApp(appId);
    const publicIds = active.map(e => e.publicId);
    expect(publicIds).toContain(live.endpoint.publicId);
    expect(publicIds).not.toContain(stopped.endpoint.publicId);
  });
});

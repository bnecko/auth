import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { createServer, type Server } from 'http';
import { createRequire } from 'module';
import { query, queryOne } from '@/lib/server/db';
import { enqueueWebhookEvent, registerWebhookEndpoint } from '@/lib/server/webhooks';
import { hashToken, publicId, randomToken } from '@/lib/server/crypto';

type WorkerDeliveryRow = {
  id: number;
  public_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  url: string;
  secret: string;
};

// worker.js is plain CommonJS (the Docker worker target ships no TS
// build). Pull the delivery functions through createRequire so the
// untyped .js import doesn't trip tsc, and so importing it doesn't open
// a Redis connection (startWorker is behind a require.main guard).
const requireCjs = createRequire(import.meta.url);
const worker = requireCjs('../../worker.js') as {
  deliverOne: (row: WorkerDeliveryRow) => Promise<void>;
  processWebhookBatch: () => Promise<void>;
  RETRY_DELAYS_SECONDS: number[];
  MAX_ATTEMPTS: number;
};

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

type ReceivedRequest = { headers: Record<string, string | string[] | undefined>; body: string };
let server: Server;
let baseUrl = '';
let responseStatus = 200;
let received: ReceivedRequest[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.statusCode = responseStatus;
      res.end('ok');
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind fixture server');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

beforeEach(() => {
  responseStatus = 200;
  received = [];
});

async function seedApp() {
  const token = randomToken(8);
  const row = await queryOne<{ id: string }>(
    `insert into external_apps (public_id, name, slug, api_key_hash, oauth_client_secret_hash, allowed_redirect_urls, status)
     values ($1, 'WhDeliveryTest', $2, $3, $3, array['https://example.com/'], 'active')
     returning id`,
    [publicId('app'), `whd-${token.toLowerCase()}`, hashToken(randomToken(32))],
  );
  if (!row) throw new Error('failed to seed app');
  return Number(row.id);
}

async function seedPendingDelivery(path: string) {
  const appId = await seedApp();
  const { endpoint, secret } = await registerWebhookEndpoint({
    appId,
    url: `${baseUrl}${path}`,
    eventTypes: ['activation.approved'],
  });
  await enqueueWebhookEvent({ appId, eventType: 'activation.approved', payload: { id: 'act_test' } });
  const delivery = await queryOne<{ id: string; public_id: string }>(
    `select id, public_id from webhook_deliveries where webhook_endpoint_id = $1 order by created_at desc limit 1`,
    [endpoint.id],
  );
  if (!delivery) throw new Error('enqueue created no delivery');
  return { deliveryId: Number(delivery.id), deliveryPublicId: delivery.public_id, secret, url: `${baseUrl}${path}` };
}

async function readDelivery(id: number) {
  return queryOne<{
    status: string;
    attempt_count: number;
    response_status: number | null;
    last_error: string | null;
    delivered_at: string | null;
    seconds_until_next: number | null;
  }>(
    `select status, attempt_count, response_status, last_error, delivered_at::text,
            extract(epoch from (next_attempt_at - now()))::int as seconds_until_next
       from webhook_deliveries where id = $1`,
    [id],
  );
}

describeDb('webhook delivery loop', () => {
  it('delivers a pending event and marks it delivered with a verifiable signature', async () => {
    responseStatus = 200;
    const { deliveryId } = await seedPendingDelivery('/ok');

    await worker.processWebhookBatch();

    const row = await readDelivery(deliveryId);
    expect(row?.status).toBe('delivered');
    expect(row?.response_status).toBe(200);
    expect(row?.attempt_count).toBe(1);
    expect(row?.delivered_at).toBeTruthy();

    // The receiver got exactly one POST whose signature matches
    // HMAC-SHA256(secret, "timestamp.body") — what the SDK verifies.
    expect(received).toHaveLength(1);
    const { headers, body } = received[0];
    const stored = await queryOne<{ secret: string }>(
      `select e.secret from webhook_endpoints e
         join webhook_deliveries d on d.webhook_endpoint_id = e.id
        where d.id = $1`,
      [deliveryId],
    );
    const expected = createHmac('sha256', stored!.secret)
      .update(`${headers['x-bottleneck-timestamp']}.${body}`)
      .digest('hex');
    expect(headers['x-bottleneck-signature']).toBe(expected);
    expect(headers['x-bottleneck-event']).toBe('activation.approved');
  });

  it('reschedules a failed delivery with the first backoff step', async () => {
    responseStatus = 500;
    const { deliveryId, deliveryPublicId, secret, url } = await seedPendingDelivery('/fail');

    await worker.deliverOne({
      id: deliveryId,
      public_id: deliveryPublicId,
      event_type: 'activation.approved',
      payload: { id: 'act_test' },
      attempt_count: 0,
      url,
      secret,
    });

    const row = await readDelivery(deliveryId);
    expect(row?.status).toBe('pending');
    expect(row?.attempt_count).toBe(1);
    expect(row?.response_status).toBe(500);
    expect(row?.last_error).toBe('HTTP 500');
    // First retry is RETRY_DELAYS_SECONDS[1] (60s) ahead, minus the
    // few ms elapsed since the row was written.
    expect(row?.seconds_until_next).toBeGreaterThan(worker.RETRY_DELAYS_SECONDS[1] - 10);
    expect(row?.seconds_until_next).toBeLessThanOrEqual(worker.RETRY_DELAYS_SECONDS[1]);
  });

  it('marks a delivery failed after the maximum number of attempts', async () => {
    responseStatus = 500;
    const { deliveryId, deliveryPublicId, secret, url } = await seedPendingDelivery('/exhaust');

    for (let attempt = 0; attempt < worker.MAX_ATTEMPTS; attempt++) {
      const before = await readDelivery(deliveryId);
      await worker.deliverOne({
        id: deliveryId,
        public_id: deliveryPublicId,
        event_type: 'activation.approved',
        payload: { id: 'act_test' },
        attempt_count: before?.attempt_count ?? 0,
        url,
        secret,
      });
    }

    const row = await readDelivery(deliveryId);
    expect(row?.status).toBe('failed');
    expect(row?.attempt_count).toBe(worker.MAX_ATTEMPTS);
    expect(row?.seconds_until_next).toBeNull();
  });
});

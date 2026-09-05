import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueEvents, Worker } from 'bullmq';
import Redis from 'ioredis';
import { randomToken } from '@/lib/server/crypto';
import { getTelegramQueue } from '@/lib/server/queue';
import redis from '@/lib/server/redis';

const describeRedis = process.env.REDIS_URL ? describe : describe.skip;
const QUEUE = 'telegram-notifications';

// Worker and QueueEvents block on Redis, and bullmq requires
// maxRetriesPerRequest: null on those connections (worker.js does the same).
// The producer side goes through getTelegramQueue(), the app's shared client,
// which is the wiring this test exists to prove end to end.
const blockingConnection = () =>
  new Redis(process.env.REDIS_URL as string, { maxRetriesPerRequest: null });

// bullmq's blocking connections retry forever, so an unreachable Redis would
// hang the suite until the hook timeout with no explanation. Probe once with
// a bounded client first and fail with the address instead.
async function assertRedisReachable() {
  const probe = new Redis(process.env.REDIS_URL as string, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  });
  try {
    await probe.connect();
    await probe.ping();
  } catch (err) {
    throw new Error(
      `REDIS_URL is set but Redis is unreachable at ${process.env.REDIS_URL}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    probe.disconnect();
  }
}

describeRedis('telegram-notifications queue round trip', () => {
  let worker: Worker | undefined;
  let events: QueueEvents | undefined;

  beforeAll(async () => {
    await assertRedisReachable();
    events = new QueueEvents(QUEUE, { connection: blockingConnection() });
    await events.waitUntilReady();
    worker = new Worker(
      QUEUE,
      async job => {
        if (job.data.text === 'boom') throw new Error('boom');
        return { echoed: job.data.text };
      },
      { connection: blockingConnection() },
    );
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker?.close();
    await events?.close();
    await getTelegramQueue().close();
    await redis.quit().catch(() => undefined);
  });

  it('completes a job enqueued through getTelegramQueue', async () => {
    const text = `roundtrip ${randomToken(6)}`;
    const job = await getTelegramQueue().add('send', { chat_id: 'ci', text });

    await expect(job.waitUntilFinished(events as QueueEvents, 10_000)).resolves.toEqual({ echoed: text });
    expect(await job.getState()).toBe('completed');
  });

  it('surfaces a processor throw as a failed job', async () => {
    const job = await getTelegramQueue().add(
      'send',
      { chat_id: 'ci', text: 'boom' },
      { attempts: 1 },
    );

    await expect(job.waitUntilFinished(events as QueueEvents, 10_000)).rejects.toThrow('boom');
    expect(await job.getState()).toBe('failed');
  });
});

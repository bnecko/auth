import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { query } from '@/lib/server/db';

const requireCjs = createRequire(import.meta.url);
const { buildDailyDigest, sendDailyDigest } = requireCjs('../../worker-digest.js') as {
  buildDailyDigest: (pool: Pool, opts?: Record<string, unknown>) => Promise<string>;
  sendDailyDigest: (opts: Record<string, unknown>) => Promise<boolean>;
};

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('daily digest', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  afterAll(() => pool.end());

  it('reports the last 24h from tables the service already writes', async () => {
    await query(
      `insert into security_events (event_type, result, metadata)
       values ('digest_test_event', 'ok', '{}'::jsonb)`,
    );

    const text = await buildDailyDigest(pool, { startedAt: Date.now() - 90 * 60 * 1000 });

    expect(text).toMatch(/^Daily digest auth\.bneck\.com \(\d{4}-\d{2}-\d{2} UTC\)/);
    expect(text).toContain('worker up 1h 30m');
    expect(text).toMatch(/users: \d+ total, \d+ new, \d+ pending deletion/);
    expect(text).toMatch(/webhooks: \d+ delivered, \d+ failed, \d+ cancelled, \d+ overdue; endpoints \d+ active, \d+ disabled today/);
    expect(text).toContain('digest_test_event');
  });

  it('sends only during the digest hour, keyed by day', async () => {
    const sent: string[] = [];
    const alerts = { send: async (key: string) => { sent.push(key); return true; } };
    const at = Date.UTC(2026, 8, 5, 8, 10);
    const off = Date.UTC(2026, 8, 5, 9, 10);

    expect(await sendDailyDigest({ pool, alerts, hourUtc: 8, now: () => off })).toBe(false);
    expect(await sendDailyDigest({ pool, alerts, hourUtc: 8, now: () => at })).toBe(true);
    expect(sent).toEqual(['digest:2026-09-05']);
  });
});

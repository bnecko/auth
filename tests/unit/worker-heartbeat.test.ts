import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const worker = requireCjs('../../worker.js') as {
  LOOP_TOLERANCE_MS: Record<string, number>;
  markLoopOk: (loop: string, at?: number) => void;
  staleLoops: (now?: number, since?: number) => string[];
  _resetLoopStateForTests: () => void;
  pingHeartbeat: (url: string, fetchImpl?: (url: string, init: RequestInit) => Promise<{ ok: boolean; status?: number }>) => Promise<boolean>;
};

const LOOPS = Object.keys(worker.LOOP_TOLERANCE_MS);
const T0 = Date.UTC(2026, 8, 6, 12, 0, 0);

describe('worker heartbeat: loop freshness', () => {
  beforeEach(() => {
    for (const loop of LOOPS) worker.markLoopOk(loop, T0);
  });

  it('reports no stale loops right after every loop completed', () => {
    expect(worker.staleLoops(T0 + 1000)).toEqual([]);
  });

  it('flags a loop once its tolerance has passed, and only that loop', () => {
    worker.markLoopOk('webhook_delivery', T0 - worker.LOOP_TOLERANCE_MS.webhook_delivery - 1);
    expect(worker.staleLoops(T0)).toEqual(['webhook_delivery']);
  });

  it('counts a loop that never completed from process start', () => {
    worker._resetLoopStateForTests();
    const olderThanEveryTolerance = T0 - worker.LOOP_TOLERANCE_MS.hygiene - 1;
    expect(worker.staleLoops(T0, olderThanEveryTolerance)).toEqual(LOOPS);
    expect(worker.staleLoops(T0, T0)).toEqual([]);
  });

  it('tolerances are a little over two periods of each loop', () => {
    expect(worker.LOOP_TOLERANCE_MS.webhook_delivery).toBeGreaterThan(2 * 1000);
    expect(worker.LOOP_TOLERANCE_MS.activation_expiry).toBeGreaterThan(2 * 60_000);
    expect(worker.LOOP_TOLERANCE_MS.hygiene).toBeGreaterThan(60 * 60_000);
  });
});

describe('worker heartbeat: ping', () => {
  it('is a no-op without a URL', async () => {
    const fetchImpl = vi.fn();
    expect(await worker.pingHeartbeat('', fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('GETs the URL with a timeout and reports success', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    expect(await worker.pingHeartbeat('https://ping.example/abc', fetchImpl)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ping.example/abc');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('never throws: a rejected or failed ping is reported as false', async () => {
    expect(await worker.pingHeartbeat('https://ping.example/abc', async () => ({ ok: false, status: 503 }))).toBe(false);
    expect(await worker.pingHeartbeat('https://ping.example/abc', async () => { throw new Error('ECONNRESET'); })).toBe(false);
  });
});

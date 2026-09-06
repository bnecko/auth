import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const { createOperatorAlerter, noopAlerter } = requireCjs('../../worker-alert.js') as {
  createOperatorAlerter: (opts: Record<string, unknown>) => {
    send: (key: string, text: string, opts?: { windowSeconds?: number }) => Promise<boolean>;
  };
  noopAlerter: { send: () => Promise<boolean> };
};

const redis = {
  set: vi.fn<(...args: unknown[]) => Promise<string | null>>(async () => 'OK'),
  incr: vi.fn<(...args: unknown[]) => Promise<number>>(async () => 1),
  expire: vi.fn<(...args: unknown[]) => Promise<number>>(async () => 1),
};
const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<{ ok: boolean; status?: number }>>(
  async () => ({ ok: true }),
);
const log = { error: vi.fn() };

function alerter(overrides: Record<string, unknown> = {}) {
  return createOperatorAlerter({
    redis,
    chatId: '-100',
    token: 'tok',
    enabled: true,
    log,
    fetchImpl,
    ...overrides,
  });
}

describe('worker operator alerter', () => {
  beforeEach(() => {
    redis.set.mockReset().mockResolvedValue('OK');
    fetchImpl.mockReset().mockResolvedValue({ ok: true });
    log.error.mockClear();
  });

  it('sends once per key and posts to the Telegram API with a timeout', async () => {
    const a = alerter();
    expect(await a.send('k', 'hello')).toBe(true);
    expect(await a.send('k', 'again')).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottok/sendMessage');
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: '-100', text: 'hello' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(redis.set).toHaveBeenCalledWith('alert:k', '1', 'EX', 300, 'NX');
  });

  it('honours a caller-supplied window', async () => {
    await alerter().send('k', 'x', { windowSeconds: 1800 });
    expect(redis.set).toHaveBeenCalledWith('alert:k', '1', 'EX', 1800, 'NX');
  });

  it('defers when the shared window is held elsewhere', async () => {
    redis.set.mockResolvedValue(null);
    expect(await alerter().send('k', 'x')).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails open on Redis errors but stays bounded by the local window', async () => {
    redis.set.mockRejectedValue(new Error('down'));
    const a = alerter();
    expect(await a.send('k', 'x')).toBe(true);
    expect(await a.send('k', 'x')).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('is disabled outside production and logs a failed post', async () => {
    expect(await alerter({ enabled: false }).send('k', 'x')).toBe(false);
    fetchImpl.mockResolvedValue({ ok: false, status: 500 });
    expect(await alerter().send('k2', 'x')).toBe(false);
    expect(log.error).toHaveBeenCalledWith('operator_alert_failed', expect.objectContaining({ alert: 'k2' }));
  });

  it('noopAlerter never sends', async () => {
    expect(await noopAlerter.send()).toBe(false);
  });
});

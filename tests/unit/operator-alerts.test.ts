import { beforeEach, describe, expect, it, vi } from 'vitest';

type AlertInput = { chatId: string | number; text: string };
const redisSet = vi.fn<(...args: unknown[]) => Promise<string | null>>();
const redisIncr = vi.fn<(...args: unknown[]) => Promise<number>>(async () => 1);
const redisExpire = vi.fn<(...args: unknown[]) => Promise<number>>(async () => 1);
const sendTelegramMessage = vi.fn<(input: AlertInput) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
let production = true;
let chatId = '-100';

vi.mock('@/lib/server/redis', () => ({
  default: {
    set: (...args: unknown[]) => redisSet(...args),
    incr: (...args: unknown[]) => redisIncr(...args),
    expire: (...args: unknown[]) => redisExpire(...args),
  },
  getLastRedisError: () => ({ at: '2026-09-05T00:00:00.000Z', message: 'ECONNREFUSED' }),
}));
vi.mock('@/lib/server/config', () => ({
  alertTelegramChatId: () => chatId,
  isProduction: () => production,
}));
vi.mock('@/lib/server/telegramSend', () => ({
  sendTelegramMessage: (input: AlertInput) => sendTelegramMessage(input),
}));
vi.mock('@/lib/server/log', () => ({ log: { error: vi.fn() } }));

const { sendOperatorAlert, alertRedisDegraded, _resetForTests } = await import(
  '@/lib/server/services/operatorAlerts'
);

describe('sendOperatorAlert', () => {
  beforeEach(() => {
    _resetForTests();
    production = true;
    chatId = '-100';
    redisSet.mockReset().mockResolvedValue('OK');
    sendTelegramMessage.mockClear();
  });

  it('sends once per key inside the window', async () => {
    expect(await sendOperatorAlert('k', 'first')).toBe(true);
    expect(await sendOperatorAlert('k', 'second')).toBe(false);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage.mock.calls[0][0]).toEqual({ chatId: '-100', text: 'first' });
  });

  it('defers to another process that already holds the shared window', async () => {
    redisSet.mockResolvedValue(null);
    expect(await sendOperatorAlert('k', 'text')).toBe(false);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('fails open when Redis is down, bounded by the local window', async () => {
    redisSet.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await sendOperatorAlert('k', 'text')).toBe(true);
    expect(await sendOperatorAlert('k', 'text')).toBe(false);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
  });

  it('is a no-op outside production or without a chat id', async () => {
    production = false;
    expect(await sendOperatorAlert('k', 'text')).toBe(false);
    production = true;
    chatId = '';
    expect(await sendOperatorAlert('k', 'text')).toBe(false);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('reports a Telegram failure as not sent without throwing', async () => {
    sendTelegramMessage.mockRejectedValueOnce(new Error('telegram sendMessage failed: 500'));
    expect(await sendOperatorAlert('k', 'text')).toBe(false);
  });

  it('alertRedisDegraded carries the last Redis error and uses the long window', async () => {
    alertRedisDegraded();
    await new Promise(r => setTimeout(r, 0));
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    const { text } = sendTelegramMessage.mock.calls[0][0];
    expect(text).toContain('Redis unreachable');
    expect(text).toContain('ECONNREFUSED');
    expect(redisSet).toHaveBeenCalledWith('alert:redis_degraded', '1', 'EX', 1800, 'NX');
  });
});

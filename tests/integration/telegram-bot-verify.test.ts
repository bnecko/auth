import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

function makeRequest(secretHeader?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secretHeader !== undefined) {
    headers['x-bottleneck-bot-secret'] = secretHeader;
  }
  return new NextRequest('http://localhost/api/telegram/bot/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({ startToken: 'x', telegram_id: '1' }),
  });
}

describe('telegram bot verify: fail-closed auth', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 when TELEGRAM_BOT_WEBHOOK_SECRET is unset', async () => {
    vi.stubEnv('TELEGRAM_BOT_WEBHOOK_SECRET', '');
    const { POST } = await import('@/app/api/telegram/bot/verify/route');
    const res = await POST(makeRequest('anything'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the provided secret does not match', async () => {
    vi.stubEnv('TELEGRAM_BOT_WEBHOOK_SECRET', 'the-real-secret');
    const { POST } = await import('@/app/api/telegram/bot/verify/route');
    const res = await POST(makeRequest('wrong-secret'));
    expect(res.status).toBe(403);
  });
});

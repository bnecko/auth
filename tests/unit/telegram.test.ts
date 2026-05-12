import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, createHmac } from 'crypto';
import { verifyTelegramLogin } from '@/lib/server/telegram';

const BOT_TOKEN = 'test-bot-token:0000000000';

function signPayload(payload: Record<string, string | number>) {
  const dataCheckString = Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHash('sha256').update(BOT_TOKEN).digest();
  return createHmac('sha256', secret).update(dataCheckString).digest('hex');
}

describe('verifyTelegramLogin', () => {
  let originalToken: string | undefined;

  beforeAll(() => {
    originalToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  });

  afterAll(() => {
    if (originalToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalToken;
    }
  });

  it('accepts a valid signature with a fresh auth_date', () => {
    const payload = {
      id: 12345,
      first_name: 'Alex',
      username: 'alex',
      auth_date: Math.floor(Date.now() / 1000) - 30,
    };
    const hash = signPayload(payload);
    const result = verifyTelegramLogin({ ...payload, hash });
    expect(result).not.toBeNull();
    expect(result?.id).toBe('12345');
    expect(result?.firstName).toBe('Alex');
    expect(result?.username).toBe('alex');
  });

  it('rejects a tampered payload', () => {
    const payload = {
      id: 12345,
      first_name: 'Alex',
      auth_date: Math.floor(Date.now() / 1000) - 30,
    };
    const hash = signPayload(payload);
    // Swap the first_name after signing — the HMAC no longer matches
    const result = verifyTelegramLogin({
      ...payload,
      first_name: 'Mallory',
      hash,
    });
    expect(result).toBeNull();
  });

  it('rejects a stale auth_date older than the 24h replay window', () => {
    const payload = {
      id: 12345,
      first_name: 'Alex',
      auth_date: Math.floor(Date.now() / 1000) - 86400 - 60,
    };
    const hash = signPayload(payload);
    expect(verifyTelegramLogin({ ...payload, hash })).toBeNull();
  });

  it('rejects an auth_date in the future', () => {
    const payload = {
      id: 12345,
      first_name: 'Alex',
      auth_date: Math.floor(Date.now() / 1000) + 600,
    };
    const hash = signPayload(payload);
    expect(verifyTelegramLogin({ ...payload, hash })).toBeNull();
  });

  it('rejects a missing hash', () => {
    const payload = {
      id: 12345,
      first_name: 'Alex',
      auth_date: Math.floor(Date.now() / 1000),
    };
    expect(verifyTelegramLogin(payload)).toBeNull();
  });

  it('rejects when the bot token does not match', () => {
    const payload = {
      id: 12345,
      first_name: 'Alex',
      auth_date: Math.floor(Date.now() / 1000) - 30,
    };
    const wrongSecret = createHash('sha256').update('different-token').digest();
    const wrongHash = createHmac('sha256', wrongSecret)
      .update(`auth_date=${payload.auth_date}\nfirst_name=${payload.first_name}\nid=${payload.id}`)
      .digest('hex');
    expect(verifyTelegramLogin({ ...payload, hash: wrongHash })).toBeNull();
  });
});

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The bot is the only handler of the bearer approve/reject callbacks and
// compares the tapping user against BEARER_ADMIN_TELEGRAM_ID. An unset value
// used to fall back to a placeholder that no Telegram id can equal, so every
// decision was silently refused. Boot must fail loudly instead.
function bootBot(env: Record<string, string>) {
  return spawnSync(process.execPath, ['index.js'], {
    cwd: path.resolve(process.cwd(), 'bot'),
    env: { NODE_ENV: 'test', PATH: process.env.PATH || '', ...env },
    encoding: 'utf8',
    timeout: 5_000,
  });
}

describe('bot env contract', () => {
  it('refuses to start without BEARER_ADMIN_TELEGRAM_ID', () => {
    const result = bootBot({
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_BOT_WEBHOOK_SECRET: 'test-secret',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('BEARER_ADMIN_TELEGRAM_ID is required');
  });

  it('names the missing variable for every required secret', () => {
    const result = bootBot({ BEARER_ADMIN_TELEGRAM_ID: '1' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('TELEGRAM_BOT_TOKEN is required');
  });
});

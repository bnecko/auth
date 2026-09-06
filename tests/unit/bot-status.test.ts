import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type Probe = { ok: boolean | null; detail: string };
type Report = {
  app: Probe;
  tunnel: Probe;
  external: Probe & { checks: Record<string, { status: string; since: number; detail: string }>; heartbeats: Record<string, number> };
  cloudflare: Probe;
};
type Diagnosis = { verdict: 'UP' | 'DEGRADED' | 'DOWN'; where: string | null };
type StatusModule = {
  isStatusCommand: (text: string | undefined) => boolean;
  mayRequestStatus: (message: unknown, gate: { alertChatId?: string; adminTelegramId: string }) => boolean;
  gatherStatus: (opts: {
    appUrl: string;
    tunnelReadyUrl: string;
    monitorStatusUrl: string;
    fetchImpl: (url: string) => Promise<Response>;
  }) => Promise<Report>;
  diagnose: (report: Report) => Diagnosis;
  formatStatus: (report: Report, diagnosis: Diagnosis, opts?: { now?: number; viaTelegram?: boolean }) => string;
};

// The bot ships as an untyped ES module; load it by URL the way the worker
// tests use createRequire, so the root typecheck does not need allowJs.
const status = (await import(pathToFileURL(path.resolve(process.cwd(), 'bot/status.js')).href)) as StatusModule;

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);
const APP = 'http://app:3000';
const TUNNEL = 'http://cloudflared:2000/ready';
const MONITOR = 'https://monitor.example/status?token=secret';

function reply(statusCode: number, body: unknown) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { 'content-type': 'application/json' } });
}

function externalBody(overrides: Partial<Record<string, { status: string; detail: string }>> = {}, botAgeMs = 30_000) {
  const check = (name: string, fallback: { status: string; detail: string }) => ({
    name,
    since: NOW - 3_600_000,
    failures: 0,
    ...fallback,
    ...(overrides[name] ?? {}),
  });
  return {
    now: NOW,
    checks: [
      check('http_ready', { status: 'up', detail: '200 ok' }),
      check('http_discovery', { status: 'up', detail: '200 issuer ok' }),
      check('heartbeat_worker', { status: 'up', detail: 'last seen 40s ago' }),
      check('heartbeat_bot', { status: 'up', detail: 'last seen 30s ago' }),
    ],
    heartbeats: [
      { name: 'worker', last_seen_at: NOW - 40_000 },
      { name: 'bot', last_seen_at: NOW - botAgeMs },
    ],
  };
}

type Answers = Partial<Record<'app' | 'tunnel' | 'monitor' | 'cloudflare', () => Promise<Response>>>;

function fakeFetch(answers: Answers) {
  const healthy: Required<Answers> = {
    app: async () => reply(200, { ok: true, checks: { postgres: true, redis: true } }),
    tunnel: async () => reply(200, { status: 200, readyConnections: 4 }),
    monitor: async () => reply(200, externalBody()),
    cloudflare: async () => reply(200, { status: { indicator: 'none', description: 'All Systems Operational' } }),
  };
  const merged = { ...healthy, ...answers };
  return async (url: string) => {
    if (url.startsWith(APP)) return merged.app();
    if (url === TUNNEL) return merged.tunnel();
    if (url === MONITOR) return merged.monitor();
    if (url.includes('cloudflarestatus.com')) return merged.cloudflare();
    throw new Error(`unexpected url ${url}`);
  };
}

async function run(answers: Answers = {}, monitorStatusUrl = MONITOR) {
  const report = await status.gatherStatus({
    appUrl: APP,
    tunnelReadyUrl: TUNNEL,
    monitorStatusUrl,
    fetchImpl: fakeFetch(answers),
  });
  return { report, diagnosis: status.diagnose(report) };
}

describe('/status command gate', () => {
  it('matches the bare and the addressed command only', () => {
    expect(status.isStatusCommand('/status')).toBe(true);
    expect(status.isStatusCommand('/status@auth_bot')).toBe(true);
    expect(status.isStatusCommand('/status please')).toBe(true);
    expect(status.isStatusCommand('/statusx')).toBe(false);
    expect(status.isStatusCommand('/start abc')).toBe(false);
    expect(status.isStatusCommand(undefined)).toBe(false);
  });

  it('answers in the alert chat or to the admin in private, nowhere else', () => {
    const gate = { alertChatId: '-100123', adminTelegramId: '42' };
    expect(status.mayRequestStatus({ chat: { id: -100123, type: 'supergroup' }, from: { id: 7 } }, gate)).toBe(true);
    expect(status.mayRequestStatus({ chat: { id: 42, type: 'private' }, from: { id: 42 } }, gate)).toBe(true);
    expect(status.mayRequestStatus({ chat: { id: 8, type: 'private' }, from: { id: 8 } }, gate)).toBe(false);
    expect(status.mayRequestStatus({ chat: { id: -100999, type: 'supergroup' }, from: { id: 42 } }, gate)).toBe(false);
    expect(status.mayRequestStatus({ chat: { id: -100999, type: 'supergroup' }, from: { id: 42 } }, { adminTelegramId: '42' })).toBe(false);
  });
});

describe('/status diagnosis', () => {
  it('is UP with nothing to blame when every layer answers', async () => {
    const { report, diagnosis } = await run();
    expect(diagnosis).toEqual({ verdict: 'UP', where: null });
    const text = status.formatStatus(report, diagnosis, { now: NOW });
    expect(text).toContain('Status: UP\nWhere: nothing is down');
    expect(text).toContain('Tunnel (cloudflared): ok - 4 edge connections');
    expect(text).toContain('Host app: ok - postgres ok, redis ok');
    expect(text).toContain('Host worker: ok - heartbeat 40s ago');
    expect(text).toContain('Public probe: ok - ready 200 ok, discovery ok');
    expect(text).toContain('Checked 12:00 UTC. If the site still fails for you');
    expect(text).not.toContain('secret');
  });

  it('blames the host when the app reports a dead dependency', async () => {
    const { report, diagnosis } = await run({
      app: async () => reply(503, { ok: false, checks: { postgres: false, redis: true }, failed: ['postgres'] }),
    });
    expect(diagnosis).toEqual({ verdict: 'DOWN', where: 'host (app): 503, postgres down, redis ok' });
    expect(status.formatStatus(report, diagnosis, { now: NOW })).toContain('Host app: DOWN - 503, postgres down, redis ok');
  });

  it('blames the host when the app does not answer at all', async () => {
    const { diagnosis } = await run({
      app: async () => {
        throw new Error('fetch failed');
      },
    });
    expect(diagnosis.verdict).toBe('DOWN');
    expect(diagnosis.where).toBe('host (app): unreachable (fetch failed)');
  });

  it('blames the tunnel when cloudflared has no edge connection', async () => {
    const { diagnosis } = await run({ tunnel: async () => reply(503, { status: 503, readyConnections: 0 }) });
    expect(diagnosis).toEqual({ verdict: 'DOWN', where: 'Cloudflare tunnel: cloudflared 0 edge connections' });
  });

  it('blames the edge when origin and tunnel are fine but the public probe fails', async () => {
    const { report, diagnosis } = await run({
      monitor: async () => reply(200, externalBody({ http_ready: { status: 'down', detail: 'status 502' } })),
      cloudflare: async () => reply(200, { status: { indicator: 'major', description: 'Partial System Outage' } }),
    });
    expect(diagnosis.verdict).toBe('DOWN');
    expect(diagnosis.where).toBe(
      'Cloudflare edge: origin and tunnel are healthy but the public probe fails (status 502); Cloudflare reports Partial System Outage',
    );
    const text = status.formatStatus(report, diagnosis, { now: NOW });
    expect(text).toContain('Cloudflare: incident - Partial System Outage');
    expect(text).toContain('Public probe: DOWN since 11:00 UTC - ready status 502, discovery ok');
  });

  it('is DEGRADED when the worker heartbeat is stale', async () => {
    const { diagnosis } = await run({
      monitor: async () => reply(200, externalBody({ heartbeat_worker: { status: 'down', detail: 'last seen 400s ago' } })),
    });
    expect(diagnosis).toEqual({ verdict: 'DEGRADED', where: 'host (worker): heartbeat last seen 400s ago' });
  });

  it('stays UP but says so when the external monitor cannot be reached', async () => {
    const { report, diagnosis } = await run({
      monitor: async () => {
        throw new Error('fetch failed');
      },
    });
    expect(diagnosis).toEqual({ verdict: 'UP', where: 'unverified from outside: external monitor unreachable (fetch failed)' });
    const text = status.formatStatus(report, diagnosis, { now: NOW });
    expect(text).toContain('Host worker: unknown - heartbeat never');
    expect(text).toContain('Public probe: unknown - unreachable (fetch failed)');
  });

  it('treats an unconfigured monitor URL as not configured, not as an outage', async () => {
    const { diagnosis } = await run({}, '');
    expect(diagnosis).toEqual({ verdict: 'UP', where: 'unverified from outside: external monitor not configured' });
  });

  it('labels a shell run so the Telegram leg is not claimed', async () => {
    const { report, diagnosis } = await run();
    expect(status.formatStatus(report, diagnosis, { now: NOW, viaTelegram: false })).toContain(
      'You -> Telegram -> bot: not exercised (shell run)',
    );
  });
});

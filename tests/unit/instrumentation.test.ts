import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestError } from '@/instrumentation';

type ErrorContext = Parameters<NonNullable<typeof onRequestError>>[2];

const context = {
  routerKind: 'App Router',
  routePath: '/oauth/authorize',
  routeType: 'render',
  renderSource: 'react-server-components',
  revalidateReason: undefined,
} as unknown as ErrorContext;

let written: string[] = [];

beforeEach(() => {
  written = [];
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.spyOn(process.stderr, 'write').mockImplementation(line => {
    written.push(String(line));
    return true;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('onRequestError', () => {
  it('logs the request id, digest and stack without headers or query string', async () => {
    const error = Object.assign(new Error('boom'), { digest: 'dg_123' });

    await onRequestError!(
      error,
      {
        path: '/oauth/authorize?state=secret-state&code_challenge=secret-challenge',
        method: 'GET',
        headers: { 'x-request-id': 'req_abc', cookie: 'bn_session=secret-token' },
      },
      context,
    );

    expect(written).toHaveLength(1);
    const record = JSON.parse(written[0]);
    expect(record.msg).toBe('request_error');
    expect(record.requestId).toBe('req_abc');
    expect(record.digest).toBe('dg_123');
    expect(record.method).toBe('GET');
    expect(record.path).toBe('/oauth/authorize');
    expect(record.routePath).toBe('/oauth/authorize');
    expect(record.error.stack).toContain('boom');

    // Neither the cookie nor anything from the query string may reach the log.
    expect(written[0]).not.toContain('secret-token');
    expect(written[0]).not.toContain('secret-state');
    expect(written[0]).not.toContain('secret-challenge');
  });

  it('stays silent outside the node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    await onRequestError!(
      new Error('boom'),
      { path: '/', method: 'GET', headers: {} },
      context,
    );

    expect(written).toHaveLength(0);
  });
});

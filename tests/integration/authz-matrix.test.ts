import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it } from 'vitest';
import { query } from '@/lib/server/db';
import { publicId, randomToken } from '@/lib/server/crypto';
import { sessionCookieName } from '@/lib/server/config';
import { grantAdminStepUp } from '@/lib/server/adminStepUp';
import { createSession } from '@/lib/server/repositories/sessions';
import { createUser } from '@/lib/server/repositories/users';
import redis from '@/lib/server/redis';

// Every route handler is classified by the guard it relies on. A new route
// file with no entry here fails the suite: adding an endpoint means deciding,
// in writing, who may call it. The classes:
//   public            no principal, or the flow's own token
//   client-credential bearerToken(req): api key / access token
//   shared-secret     x-bottleneck-bot-secret / x-bottleneck-internal-secret
//   session-raw       getSessionFromRequest/getCurrentSession + hand-rolled
//                     checks (statically verified only)
//   session           requireUser (invoked below)
//   admin-step-up     requireAdminStepUp (invoked below)
type GuardClass =
  | 'public'
  | 'client-credential'
  | 'shared-secret'
  | 'session-raw'
  | 'session'
  | 'admin-step-up';

const ROUTES: Record<string, GuardClass> = {
  'app/admin/(panel)/security/export/route.ts': 'admin-step-up',
  'app/api/admin/users/[id]/ban/route.ts': 'admin-step-up',
  'app/api/admin/users/[id]/unban/route.ts': 'admin-step-up',

  'app/api/account/delete/route.ts': 'session',
  'app/api/account/delete/status/route.ts': 'session',
  'app/api/activations/[id]/approve/route.ts': 'session',
  'app/api/activations/[id]/deny/route.ts': 'session',
  'app/api/auth/relink/initiate/route.ts': 'session',
  'app/api/auth/relink/verify/route.ts': 'session',
  'app/api/auth/webauthn/register/generate-options/route.ts': 'session',
  'app/api/auth/webauthn/register/verify/route.ts': 'session',
  'app/api/bearer-requests/route.ts': 'session',
  'app/api/bearer-requests/[id]/route.ts': 'session',
  'app/api/bearer-requests/[id]/reveal/route.ts': 'session',
  'app/api/bearer-requests/[id]/revoke/route.ts': 'session',
  'app/api/bearer-requests/[id]/revoke/status/route.ts': 'session',
  'app/api/oauth/authorize/approve/route.ts': 'session',
  'app/api/oauth/authorize/deny/route.ts': 'session',

  'app/api/activation-requests/route.ts': 'client-credential',
  'app/api/activation-requests/[id]/route.ts': 'client-credential',
  'app/api/activation-requests/[id]/cancel/route.ts': 'client-credential',
  'app/api/activation-requests/[id]/revoke/route.ts': 'client-credential',
  'app/api/apps/me/route.ts': 'client-credential',
  'app/api/authorizations/route.ts': 'client-credential',
  'app/api/oauth/userinfo/route.ts': 'client-credential',

  'app/api/internal/analytics/route.ts': 'shared-secret',
  'app/api/telegram/bearer/decision/route.ts': 'shared-secret',
  'app/api/telegram/bot/verify/route.ts': 'shared-secret',
  'app/api/telegram/confirm/decision/route.ts': 'shared-secret',

  'app/api/account/export/route.ts': 'session-raw',
  'app/api/admin/step-up/initiate/route.ts': 'session-raw',
  'app/api/admin/step-up/verify/route.ts': 'session-raw',
  'app/api/admin/telegram-step-up/route.ts': 'session-raw',
  'app/api/auth/relink/status/route.ts': 'session-raw',
  'app/api/telegram/callback/route.ts': 'session-raw',

  'app/.well-known/oauth-authorization-server/route.ts': 'public',
  'app/.well-known/openid-configuration/route.ts': 'public',
  'app/oauth/jwks/route.ts': 'public',
  'app/api/auth/config/route.ts': 'public',
  'app/api/auth/login/route.ts': 'public',
  'app/api/auth/login/challenges/[id]/route.ts': 'public',
  'app/api/auth/login/challenges/[id]/complete/route.ts': 'public',
  'app/api/auth/logout/route.ts': 'public',
  'app/api/auth/register/route.ts': 'public',
  // Passkey sign-in creates a session; it cannot require one.
  'app/api/auth/webauthn/login/generate-options/route.ts': 'public',
  'app/api/auth/webauthn/login/verify/route.ts': 'public',
  'app/api/health/route.ts': 'public',
  'app/api/health/ready/route.ts': 'public',
  // OAuth endpoints authenticate the client inside the service layer.
  'app/api/oauth/device/code/route.ts': 'public',
  'app/api/oauth/introspect/route.ts': 'public',
  'app/api/oauth/logout/route.ts': 'public',
  'app/api/oauth/par/route.ts': 'public',
  'app/api/oauth/reauth/route.ts': 'public',
  'app/api/oauth/register/route.ts': 'public',
  'app/api/oauth/register/[clientId]/route.ts': 'public',
  'app/api/oauth/revoke/route.ts': 'public',
  'app/api/oauth/token/route.ts': 'public',
  'app/api/telegram/verification/[id]/route.ts': 'public',
  'app/api/telegram/verification/[id]/complete/route.ts': 'public',
  'app/api/telegram/verification/[id]/send-code/route.ts': 'public',
};

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const ROOT = process.cwd();

function routeFilesOnDisk() {
  return readdirSync(path.join(ROOT, 'app'), { recursive: true, encoding: 'utf8' })
    .filter(rel => rel === 'route.ts' || rel.endsWith('/route.ts'))
    .map(rel => `app/${rel}`)
    .sort();
}

// Precedence matters: a file that calls requireAdminStepUp also references
// no other guard, but a session-raw file may mention getCurrentSession next
// to a stronger helper, so the strongest marker wins.
function classify(source: string): GuardClass {
  if (/\brequireAdminStepUp\(/.test(source)) return 'admin-step-up';
  if (/\brequireUser\(/.test(source)) return 'session';
  if (/\bbearerToken\(/.test(source)) return 'client-credential';
  if (/x-bottleneck-(bot|internal)-secret/.test(source)) return 'shared-secret';
  if (/\b(getSessionFromRequest|getCurrentSession)\(/.test(source)) return 'session-raw';
  return 'public';
}

function exportedMethods(source: string): HttpMethod[] {
  return HTTP_METHODS.filter(m => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(source));
}

function urlPathFor(file: string) {
  const segments = file
    .replace(/^app\//, '')
    .replace(/\/route\.ts$/, '')
    .split('/')
    .filter(seg => !/^\(.*\)$/.test(seg))
    .map(seg => (/^\[\w+\]$/.test(seg) ? 'matrix-placeholder' : seg));
  return `/${segments.join('/')}`;
}

function paramsFor(file: string) {
  return Object.fromEntries([...file.matchAll(/\[(\w+)\]/g)].map(m => [m[1], 'matrix-placeholder']));
}

async function invoke(file: string, method: HttpMethod, cookie?: string) {
  const mod = (await import(path.join(ROOT, file))) as Record<string, Handler>;
  const req = new NextRequest(`http://localhost${urlPathFor(file)}`, {
    method,
    headers: cookie ? { cookie } : {},
  });
  return mod[method](req, { params: Promise.resolve(paramsFor(file)) });
}

describe('route guard allowlist', () => {
  it('covers every route file on disk, and nothing else', () => {
    expect(routeFilesOnDisk()).toEqual(Object.keys(ROUTES).sort());
  });

  it.each(Object.entries(ROUTES))('%s is guarded as %s', (file, expected) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    expect(classify(source)).toBe(expected);
  });

  // The guard must run before any request parsing, so a malformed body can
  // never turn a 401 into a 400 and every denial row below is reached
  // without constructing a valid request.
  it.each(
    Object.entries(ROUTES).filter(([, cls]) => cls === 'session' || cls === 'admin-step-up'),
  )('%s checks the principal before reading the request', (file, cls) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    const guard = cls === 'session' ? source.indexOf('requireUser(') : source.indexOf('requireAdminStepUp(');
    for (const parse of ['await params', 'requestBody(', '.formData(', '.json(', 'searchParams']) {
      const at = source.indexOf(parse);
      if (at !== -1) expect(at, `${parse} precedes the guard in ${file}`).toBeGreaterThan(guard);
    }
  });
});

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const describeRedis = process.env.REDIS_URL ? describe : describe.skip;

type Principal = {
  role?: 'user' | 'admin';
  restricted?: boolean;
  status?: 'active' | 'banned';
};

async function seedPrincipal(opts: Principal = {}) {
  const suffix = randomToken(6).toLowerCase();
  const user = await createUser({
    publicId: publicId('usr'),
    firstName: 'Matrix',
    username: `matrix_${suffix}`,
    bio: null,
    email: `matrix-${suffix}@example.com`,
    dob: null,
    passwordHash: 'unused',
  });
  await query(
    `update users
        set role = coalesce($2, role),
            restricted = coalesce($3, restricted),
            status = coalesce($4, status)
      where id = $1`,
    [user.id, opts.role ?? null, opts.restricted ?? null, opts.status ?? null],
  );
  const token = randomToken();
  await createSession({
    userId: user.id,
    token,
    ip: '',
    userAgent: '',
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return { user, cookie: `${sessionCookieName}=${token}` };
}

async function body(res: Response) {
  return (await res.json().catch(() => ({}))) as { error?: string };
}

const sessionRoutes = Object.entries(ROUTES).filter(([, cls]) => cls === 'session');
const adminRoutes = Object.entries(ROUTES).filter(([, cls]) => cls === 'admin-step-up');

function methodsOf(file: string) {
  return exportedMethods(readFileSync(path.join(ROOT, file), 'utf8'));
}

// The shared client is closed once, after every describe below has run;
// closing it inside the first block would break the step-up lookups in the
// second.
afterAll(() => redis.quit().catch(() => undefined));

describeDb('session-guarded routes deny the wrong principals', () => {
  const rows = [...sessionRoutes, ...adminRoutes].flatMap(([file]) =>
    methodsOf(file).map(method => [file, method] as const),
  );

  it.each(rows)('%s %s: anonymous is 401', async (file, method) => {
    const res = await invoke(file, method);
    expect(res.status).toBe(401);
  });

  it.each(rows)('%s %s: banned is 401', async (file, method) => {
    const { cookie } = await seedPrincipal({ status: 'banned' });
    const res = await invoke(file, method, cookie);
    expect(res.status).toBe(401);
  });

  it.each(rows)('%s %s: restricted is 403', async (file, method) => {
    const { cookie } = await seedPrincipal({ restricted: true });
    const res = await invoke(file, method, cookie);
    expect(res.status).toBe(403);
    expect((await body(res)).error).toBe('account restricted');
  });

  it('lets an active user through the session guard (positive control)', async () => {
    const { cookie } = await seedPrincipal();
    const res = await invoke('app/api/account/delete/status/route.ts', 'GET', cookie);
    expect(res.status).toBe(200);
  });
});

describeDb('admin routes deny non-admins and admins without step-up', () => {
  const rows = adminRoutes.flatMap(([file]) => methodsOf(file).map(method => [file, method] as const));

  it.each(rows)('%s %s: a plain user is 403 forbidden', async (file, method) => {
    const { cookie } = await seedPrincipal();
    const res = await invoke(file, method, cookie);
    expect(res.status).toBe(403);
    expect((await body(res)).error).toBe('forbidden');
  });

  describeRedis('with the step-up store available', () => {
    it.each(rows)('%s %s: an admin without step-up is 403', async (file, method) => {
      const { cookie } = await seedPrincipal({ role: 'admin' });
      const res = await invoke(file, method, cookie);
      expect(res.status).toBe(403);
      expect((await body(res)).error).toBe('admin step-up required');
    });

    it('lets a stepped-up admin through (positive control)', async () => {
      const { user, cookie } = await seedPrincipal({ role: 'admin' });
      await grantAdminStepUp(user.id);
      const res = await invoke('app/admin/(panel)/security/export/route.ts', 'GET', cookie);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
    });
  });
});

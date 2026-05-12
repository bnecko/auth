import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? test.describe : test.describe.skip;

let pool: pg.Pool | null = null;
function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

function token(bytes = 16) {
  return randomBytes(bytes).toString("base64url");
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

type Seed = {
  appId: number;
  publicId: string;
  redirectUri: string;
};

async function seedTestClient(): Promise<Seed> {
  const client = await getPool().connect();
  try {
    const publicId = `app_e2e_${token(6)}`;
    const slug = `e2e-${token(4).toLowerCase()}`;
    const apiKey = token(32);
    const redirectUri = "https://example.com/cb";
    const { rows } = await client.query<{ id: string }>(
      `insert into external_apps (
         public_id, name, slug,
         api_key_hash, oauth_client_secret_hash,
         allowed_redirect_urls, allowed_grant_types, allowed_scopes,
         client_type, token_endpoint_auth_method, issue_refresh_tokens,
         status
       )
       values (
         $1, 'E2E Test', $2, $3, $3,
         array[$4::text],
         array['authorization_code', 'refresh_token'],
         array['openid', 'profile', 'email', 'profile:read', 'email:read'],
         'public', 'none', true,
         'active'
       )
       returning id`,
      [publicId, slug, sha256(apiKey), redirectUri],
    );
    return { appId: Number(rows[0]!.id), publicId, redirectUri };
  } finally {
    client.release();
  }
}

async function cleanupTestClient(appId: number) {
  await getPool().query("delete from external_apps where id = $1", [appId]);
}

test("/.well-known/openid-configuration advertises the new OIDC claims", async ({ request }) => {
  const res = await request.get("/.well-known/openid-configuration");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.issuer).toBeTruthy();
  expect(body.end_session_endpoint).toMatch(/\/api\/oauth\/logout$/);
  expect(body.authorization_endpoint).toMatch(/\/oauth\/authorize$/);
  expect(Array.isArray(body.prompt_values_supported)).toBe(true);
  expect(body.prompt_values_supported).toEqual(
    expect.arrayContaining(["none", "login", "consent"]),
  );
  expect(body.claims_supported).toEqual(
    expect.arrayContaining(["sub", "auth_time", "acr", "nonce"]),
  );
  expect(body.response_modes_supported).toEqual(["query"]);
  expect(body.acr_values_supported).toEqual(
    expect.arrayContaining(["urn:bottleneck:loa:1"]),
  );
});

test("/.well-known/oauth-authorization-server matches openid-configuration on shared fields", async ({ request }) => {
  const a = (await (await request.get("/.well-known/openid-configuration")).json()) as Record<string, unknown>;
  const b = (await (await request.get("/.well-known/oauth-authorization-server")).json()) as Record<string, unknown>;
  expect(a.issuer).toBe(b.issuer);
  expect(a.token_endpoint).toBe(b.token_endpoint);
  expect(a.end_session_endpoint).toBe(b.end_session_endpoint);
});

test("/api/oauth/authorize/approve rejects POST without a CSRF token", async ({ request }) => {
  const res = await request.post("/api/oauth/authorize/approve", {
    form: {
      response_type: "code",
      client_id: "app_irrelevant",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: "abc",
      code_challenge: "x",
      code_challenge_method: "S256",
      nonce: "",
    },
  });
  // requireUser returns 401 before CSRF if no session. Both 401 and
  // 400 are acceptable failure modes — the test asserts that an
  // unauthenticated cross-site POST never produces an authorization
  // code.
  expect([400, 401]).toContain(res.status());
});

describeDb("oauth authorize with seeded client", () => {
  let seed: Seed | null = null;
  let dbError: string | null = null;

  test.beforeAll(async () => {
    try {
      seed = await seedTestClient();
    } catch (err) {
      // DATABASE_URL is set but pg is unreachable from the test host
      // (common when the dockerized db doesn't expose 5432). Skip the
      // child tests with a clear note rather than failing the suite.
      dbError = err instanceof Error ? err.message : String(err);
    }
  });

  test.afterAll(async () => {
    if (seed) await cleanupTestClient(seed.appId);
  });

  test.beforeEach(() => {
    if (dbError) test.skip(true, `db unreachable: ${dbError}`);
  });

  test("prompt=none returns login_required when no session is present", async ({ request }) => {
    if (!seed) test.skip(true, "seed missing");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: seed!.publicId,
      redirect_uri: seed!.redirectUri,
      scope: "openid",
      state: "state_e2e",
      code_challenge: "ZmFrZS1jaGFsbGVuZ2U", // 22+ chars, arbitrary for an unauthenticated probe
      code_challenge_method: "S256",
      prompt: "none",
    });
    const res = await request.get(`/oauth/authorize?${params.toString()}`, {
      maxRedirects: 0,
    });
    expect([302, 307]).toContain(res.status());
    const location = res.headers().location || "";
    expect(location.startsWith(seed!.redirectUri)).toBe(true);
    expect(location).toContain("error=login_required");
    expect(location).toContain("state=state_e2e");
  });

  test("prompt=login (no session) redirects to /login with next preserved", async ({ request }) => {
    if (!seed) test.skip(true, "seed missing");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: seed!.publicId,
      redirect_uri: seed!.redirectUri,
      scope: "openid",
      state: "state_e2e",
      code_challenge: "ZmFrZS1jaGFsbGVuZ2U",
      code_challenge_method: "S256",
      prompt: "login",
    });
    const res = await request.get(`/oauth/authorize?${params.toString()}`, {
      maxRedirects: 0,
    });
    expect([302, 307]).toContain(res.status());
    const location = res.headers().location || "";
    expect(location).toMatch(/\/login\?next=/);
  });
});

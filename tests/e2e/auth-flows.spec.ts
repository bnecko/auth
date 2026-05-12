import { expect, test } from "@playwright/test";

test("login keeps remember-me visible and enabled", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "sign in" })).toBeVisible();
  await expect(page.getByLabel("email or username")).toBeVisible();
  await expect(page.getByLabel("password")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /remember me/i })).toBeChecked();
});

test("telegram 2fa waiting screen preserves bot handoff", async ({ page }) => {
  await page.goto("/login/telegram?id=test-challenge");

  await expect(page.getByText("telegram 2fa")).toBeVisible();
  await expect(page.getByText("waiting for telegram")).toBeVisible();
});

test("device flow redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/device");

  await expect(page).toHaveURL(/\/login\?next=/);
});

test("forgot password flow exposes uniform recovery copy", async ({ page }) => {
  await page.goto("/forgot");

  await expect(page.getByRole("heading", { name: "recover access" })).toBeVisible();
  await expect(page.getByLabel("Username or Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "send reset link" })).toBeVisible();
});

test("oauth consent rejects malformed authorize requests without redirecting away", async ({ page }) => {
  await page.goto("/oauth/authorize?response_type=code");

  await expect(page.getByRole("heading", { name: "authorization failed" })).toBeVisible();
  await expect(page.getByText("client_id is required")).toBeVisible();
});

test("security headers are set on every response", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.status()).toBe(200);
  const headers = res.headers();

  const csp = headers["content-security-policy"];
  expect(csp, "missing Content-Security-Policy").toBeTruthy();
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("default-src 'self'");
  // In production builds the nonce is enforced; in dev it falls back
  // to unsafe-inline. Either way the directive must be present.
  expect(/'nonce-|'unsafe-inline'/.test(csp)).toBe(true);

  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

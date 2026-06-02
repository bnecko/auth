import { expect, test } from "@playwright/test";

// The Operator Console treatment is driven entirely by design tokens and
// a single typeface defined in app/globals.css. Pixel snapshots would
// flake across the macOS/Linux font-rendering gap, so instead assert the
// tokens resolve as designed: if globals.css fails to load or a token
// regresses, every themed surface loses its look and these fail.
async function expectOperatorConsoleTokens(page: import("@playwright/test").Page) {
  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      accent: root.getPropertyValue("--accent").trim(),
      bg: root.getPropertyValue("--bg").trim(),
      fontFamily: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(tokens.accent).toBe("#ffb000");
  expect(tokens.bg).toBe("#0a0a0a");
  expect(tokens.fontFamily).toContain("JetBrains Mono");
}

test("login renders with the Operator Console tokens", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "sign in" })).toBeVisible();
  await expectOperatorConsoleTokens(page);
});

test("forgot-password renders with the Operator Console tokens", async ({ page }) => {
  await page.goto("/forgot");
  await expect(page.getByRole("heading", { name: "recover access" })).toBeVisible();
  await expectOperatorConsoleTokens(page);
});

test("oauth consent error page renders with the Operator Console tokens", async ({ page }) => {
  await page.goto("/oauth/authorize?response_type=code");
  await expect(page.getByRole("heading", { name: "authorization failed" })).toBeVisible();
  await expectOperatorConsoleTokens(page);
});

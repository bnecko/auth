import { expect, test } from "@playwright/test";

// The light theme is driven entirely by design tokens and the Inter typeface
// defined in app/globals.css and app/layout.tsx. Pixel snapshots would flake
// across the macOS/Linux font-rendering gap, so instead assert the tokens
// resolve as designed: if globals.css fails to load or a token regresses,
// every themed surface loses its look and these fail.
async function expectThemeTokens(page: import("@playwright/test").Page) {
  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      accent: root.getPropertyValue("--accent").trim(),
      bg: root.getPropertyValue("--bg").trim(),
      fontFamily: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(tokens.accent).toBe("#ffb000");
  expect(tokens.bg).toBe("#fafafa");
  expect(tokens.fontFamily).toContain("Inter");
}

test("login renders with the theme tokens", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectThemeTokens(page);
});

test("forgot-password renders with the theme tokens", async ({ page }) => {
  await page.goto("/forgot");
  await expect(page.getByRole("heading", { name: "Recover access" })).toBeVisible();
  await expectThemeTokens(page);
});

test("oauth consent error page renders with the theme tokens", async ({ page }) => {
  await page.goto("/oauth/authorize?response_type=code");
  await expect(page.getByRole("heading", { name: "Authorization failed" })).toBeVisible();
  await expectThemeTokens(page);
});

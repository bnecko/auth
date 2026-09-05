import { defineConfig, devices } from "@playwright/test";

// CI points PLAYWRIGHT_BASE_URL at the booted production image and manages
// that process itself; locally the dev server on 3100 is started (or reused).
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- -H 127.0.0.1 -p 3100",
        url: "http://127.0.0.1:3100/login",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

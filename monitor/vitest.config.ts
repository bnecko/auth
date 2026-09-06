import { defineConfig } from "vitest/config";

// The decision logic is plain TypeScript; no Workers runtime is needed to
// test it, so this is the stock node pool rather than vitest-pool-workers.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});

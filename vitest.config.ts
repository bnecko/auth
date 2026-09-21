import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', '.next', 'tests/e2e/**'],
    // Integration tests share one Postgres database. Run test files serially
    // so a table-wide operation in one file (the webhook delivery batch claim)
    // cannot race against rows another file is inserting.
    fileParallelism: false,
    // Crypto is off unless asked for, and most of the suite exercises it.
    // Tests of the off state stub this back per case.
    env: { CRYPTO_ENABLED: 'true' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})

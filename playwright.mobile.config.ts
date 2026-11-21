import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'mobile-planning.spec.ts', outputDir: '.qa-runtime/mobile-results', reporter: 'list',
  timeout: 45_000, maxFailures: 2, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3106', channel: process.env.E2E_BROWSER_CHANNEL || 'chrome', trace: 'retain-on-failure' },
  webServer: { command: 'npx --yes bun@1.3.1 scripts/preview-mobile-planning.mjs', url: 'http://127.0.0.1:3106', reuseExistingServer: !process.env.CI },
});

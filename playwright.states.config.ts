import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'application-states.spec.ts',
  outputDir: '.qa-runtime/states',
  reporter: 'list',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3112', channel: process.env.E2E_BROWSER_CHANNEL || 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3112',
    url: 'http://127.0.0.1:3112',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

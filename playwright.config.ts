import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['markdown-editor.spec.ts', 'mobile-planning.spec.ts'],
  timeout: 30_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    extraHTTPHeaders: baseURL ? { Origin: new URL(baseURL).origin } : undefined,
    trace: 'retain-on-failure',
  },
});

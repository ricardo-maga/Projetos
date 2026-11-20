import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'markdown-editor.spec.ts',
  outputDir: '.qa-runtime/markdown-results',
  reporter: 'list',
  maxFailures: 1,
  use: { baseURL: 'http://127.0.0.1:3104', trace: 'retain-on-failure', channel: process.env.E2E_BROWSER_CHANNEL },
  webServer: {
    command: 'npx --yes bun@1.3.1 scripts/preview-markdown.mjs',
    url: 'http://127.0.0.1:3104', reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'touch', use: { ...devices['Pixel 7'] } },
  ],
});

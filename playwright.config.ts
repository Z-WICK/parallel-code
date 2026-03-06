import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:1422';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  retries: 1,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'playwright-report/results.xml' }],
  ],
  webServer: {
    command: 'npx vite --config electron/vite.config.electron.ts --port 1422 --strictPort',
    url: baseURL,
    env: {
      VITE_DEV_SERVER_URL: baseURL,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

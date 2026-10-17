import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT, serverEnv } from './tests/e2e/support/env';

/**
 * E2E smoke suite (docs/qa/test-strategy.md §3). Runs the real app against a disposable
 * local Postgres (`lms_e2e_test`), seeded on every run. Never uses .env / .env.local DBs.
 * Prereq (once): create the DB and apply migrations — see tests/e2e/README.md.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false, // shared seeded database; specs reset the rows they mutate
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['json', { outputFile: 'test-reports/e2e-results.json' }], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Optional: point at an already-installed Chromium instead of the build Playwright pins
    // (avoids a browser download when the cached build is older).
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev --turbopack -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: serverEnv(),
  },
});

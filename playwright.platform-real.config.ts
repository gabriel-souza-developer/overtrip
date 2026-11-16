import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-real',
  testMatch: 'lodging.spec.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4391', ...devices['Desktop Chrome'] },
  globalSetup: './e2e-real/support/setup-platform.ts',
});

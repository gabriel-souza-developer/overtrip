import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4300',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `${process.env.E2E_REAL_API === '1' ? '' : 'OVERTRIP_E2E_MOCKS=1 '}npm run dev:frontend -- --host 127.0.0.1 --port 4300`,
    url: 'http://127.0.0.1:4300',
    // Não reutilizar um processo que possa ter proxy para uma API real.
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

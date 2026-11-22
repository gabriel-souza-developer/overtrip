import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './e2e', workers: 1, use: { baseURL: 'http://127.0.0.1:4399', ...devices['Desktop Chrome'] }, webServer: { command: 'OVERTRIP_E2E_MOCKS=1 npm run dev:frontend -- --host 127.0.0.1 --port 4399', url: 'http://127.0.0.1:4399', reuseExistingServer: false, timeout: 30000 } });

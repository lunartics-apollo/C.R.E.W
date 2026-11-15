import { defineConfig } from '@playwright/test';

// E2E smoke tests against the production preview. Requires `npx playwright install chromium` once.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1366, height: 768 }, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180_000 },
});

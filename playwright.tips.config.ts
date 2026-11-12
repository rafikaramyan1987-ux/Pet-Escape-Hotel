import { defineConfig } from '@playwright/test';

/** Layout test of the tutorial tip and the HUD overlays (e2e/tips.spec.ts) on the web build (test hooks: ?capture=1). */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'tips.spec.ts',
  timeout: 300_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:4180' },
  webServer: { command: 'npm run build && npx vite preview --port 4180 --strictPort', url: 'http://localhost:4180', reuseExistingServer: !process.env.CI, timeout: 180_000 },
});

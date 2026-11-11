import { defineConfig } from '@playwright/test';

/** Smoke test of the shipped GameMonetize build (dist-gamemonetize/index.html) with a stubbed GameMonetize SDK. */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'gamemonetize.spec.ts',
  timeout: 240_000,
  retries: process.env.CI ? 1 : 0,
  use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, baseURL: 'http://localhost:4178' },
  webServer: {
    command: 'npm run build:gamemonetize && npx vite preview --mode gamemonetize --port 4178 --strictPort',
    url: 'http://localhost:4178',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

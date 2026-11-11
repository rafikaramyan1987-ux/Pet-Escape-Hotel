import { defineConfig } from '@playwright/test';

/** Smoke test of the shipped Y8 build (dist-y8/index.html) with a stubbed Y8 SDK. */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'y8.spec.ts',
  timeout: 240_000,
  retries: process.env.CI ? 1 : 0,
  use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, baseURL: 'http://localhost:4179' },
  webServer: {
    command: 'npm run build:y8 && npx vite preview --mode y8 --port 4179 --strictPort',
    url: 'http://localhost:4179',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

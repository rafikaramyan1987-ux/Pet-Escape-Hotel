import { defineConfig } from '@playwright/test';

const mobile = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  retries: process.env.CI ? 1 : 0,
  projects: [
    { name: 'web', testMatch: 'smoke.spec.ts', use: { ...mobile, baseURL: 'http://localhost:4173' } },
    { name: 'crazygames', testMatch: 'crazygames.spec.ts', use: { ...mobile, baseURL: 'http://localhost:4174' } },
  ],
  webServer: [
    {
      command: 'npm run build && npm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build:crazygames && npx vite preview --mode crazygames --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

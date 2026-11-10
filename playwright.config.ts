import { defineConfig } from '@playwright/test';

const mobile = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
};

/** One project per build: web (GitHub Pages), CrazyGames, GameDistribution, GamePix, plus an e2e-only CrazyGames
 * build with test tooling (VITE_E2E=1, never shipped) for the rewarded-continue flow. */
const server = (cmd: string, port: number) => ({ command: cmd, url: `http://localhost:${port}`, reuseExistingServer: !process.env.CI, timeout: 180_000 });

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  retries: process.env.CI ? 1 : 0,
  projects: [
    { name: 'web', testMatch: 'smoke.spec.ts', use: { ...mobile, baseURL: 'http://localhost:4173' } },
    { name: 'crazygames', testMatch: 'crazygames.spec.ts', use: { ...mobile, baseURL: 'http://localhost:4174' } },
    { name: 'gd', testMatch: 'gd.spec.ts', use: { ...mobile, baseURL: 'http://localhost:4175' } },
    { name: 'gamepix', testMatch: 'gamepix.spec.ts', use: { ...mobile, baseURL: 'http://localhost:4176' } },
    { name: 'ads', testMatch: 'ads.spec.ts', use: { ...mobile, baseURL: 'http://localhost:4177' } },
  ],
  webServer: [
    server('npm run build && npm run preview', 4173),
    server('npm run build:crazygames && npx vite preview --mode crazygames --port 4174 --strictPort', 4174),
    server('npm run build:gd && npx vite preview --mode gd --port 4175 --strictPort', 4175),
    server('npm run build:gamepix && npx vite preview --mode gamepix --port 4176 --strictPort', 4176),
    server('VITE_E2E=1 VITE_OUTDIR=dist-e2e npx vite build --mode crazygames && VITE_OUTDIR=dist-e2e npx vite preview --mode crazygames --port 4177 --strictPort', 4177),
  ],
});

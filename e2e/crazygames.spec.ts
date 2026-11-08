import { test, expect } from '@playwright/test';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/** Minimal stand-in for the CrazyGames SDK v3 (records calls, persists data in sessionStorage). */
const STUB_SDK = `
(() => {
  const cg = (window.__cg = { calls: [] });
  const load = () => JSON.parse(sessionStorage.getItem('cg-data') || '{}');
  window.CrazyGames = { SDK: {
    environment: 'crazygames',
    init: async () => { cg.calls.push('init'); },
    ad: { requestAd: (type, cb) => { cg.calls.push('ad:' + type); cb.adStarted && cb.adStarted(); setTimeout(() => cb.adFinished && cb.adFinished(), 30); } },
    game: {
      gameplayStart: () => cg.calls.push('gameplayStart'),
      gameplayStop: () => cg.calls.push('gameplayStop'),
      loadingStart: () => cg.calls.push('loadingStart'),
      loadingStop: () => cg.calls.push('loadingStop'),
      happytime: () => cg.calls.push('happytime'),
      settings: { muteAudio: false },
      addSettingsChangeListener: () => {},
    },
    data: {
      getItem: (k) => { const d = load(); return k in d ? d[k] : null; },
      setItem: (k, v) => { const d = load(); d[k] = String(v); sessionStorage.setItem('cg-data', JSON.stringify(d)); },
    },
  } };
})();`;

test('CrazyGames build: one file, SDK order, lands in level 1, no failing request', async ({ page }) => {
  await page.route(SDK_URL, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB_SDK }));
  const requests: string[] = [];
  const failed: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('level')).toHaveText('Level 1', { timeout: 60_000 });
  const own = requests.filter((u) => u.startsWith('http://localhost'));
  expect(own.map((u) => new URL(u).pathname)).toEqual(['/']);
  expect(requests.filter((u) => !u.startsWith('http://localhost') && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([SDK_URL]);
  const calls = await page.evaluate(() => (window as unknown as { __cg: { calls: string[] } }).__cg.calls);
  expect(calls.slice(0, 4)).toEqual(['init', 'loadingStart', 'loadingStop', 'gameplayStart']);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

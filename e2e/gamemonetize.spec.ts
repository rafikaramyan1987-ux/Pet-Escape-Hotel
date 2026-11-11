import { test, expect, type Page } from '@playwright/test';
import { playLevel1, returning, watchErrors } from './portal';

/** GameMonetize build (the shipped dist-gamemonetize/index.html) with a stand-in for https://api.gamemonetize.com/sdk.js. */
const SDK_URL = 'https://api.gamemonetize.com/sdk.js';
const STUB = `
(() => {
  const gm = (window.__gm = { shown: [], events: [] });
  const ev = (name) => { gm.events.push(name); window.SDK_OPTIONS.onEvent({ name }); };
  window.sdk = { showBanner: () => {
    gm.shown.push(Date.now());
    ev('SDK_GAME_PAUSE');
    setTimeout(() => ev('SDK_GAME_START'), 400);
  } };
  ev('SDK_READY');
})();`;

type GmWin = { __gm: { shown: number[]; events: string[] }; SDK_OPTIONS: { gameId: string; onEvent: (e: { name: string }) => void } };
const shown = (page: Page) => page.evaluate(() => (window as unknown as GmWin).__gm.shown.length);

test('GameMonetize build: SDK_OPTIONS + sdk.js once at boot, no ad before a click, pre-roll on Play, level 1 played, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.route(SDK_URL, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto('/');
  await expect(page.getByTestId('play')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => (window as unknown as GmWin).SDK_OPTIONS.gameId)).toBe('qd017r024ijevcoihn7kl2hkyvkw2t7z');
  expect(await page.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => [s.id, s.getAttribute('src')]))).toEqual([['gamemonetize-sdk', SDK_URL]]);
  expect(await shown(page)).toBe(0); // no ad before a player click
  await page.getByTestId('play').click();
  await expect(page.locator('#app')).toHaveClass(/frozen/); // SDK_GAME_PAUSE: paused (and muted) during the ad
  await expect(page.locator('#app')).not.toHaveClass(/frozen/, { timeout: 10_000 });
  expect(await shown(page)).toBe(1);
  await playLevel1(page);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('level')).toHaveText('Level 2', { timeout: 30_000 });
  expect(await shown(page)).toBe(1); // the next interstitial waits ~2 minutes after the pre-roll
  expect(requests.filter((u) => !u.startsWith('http://localhost') && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([SDK_URL]);
  expect(errors).toEqual([]);
});

test('no rewarded ads on GameMonetize: no "watch an ad" badge or button anywhere', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route(SDK_URL, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await returning(page);
  await page.goto('/');
  await page.getByTestId('play').click({ timeout: 60_000 });
  await expect(page.getByTestId('level')).toHaveText('Level 6', { timeout: 30_000 });
  // no coins and no stock: the boosters keep their coin price (no ad badge)
  for (const b of ['slot', 'undo', 'hammer']) await expect(page.locator(`[data-booster=${b}] .cost b`)).toBeVisible();
  await expect(page.locator('[data-testid=continue]')).toHaveCount(0);
  await page.getByTestId('booster-slot').click();
  await expect(page.locator('#toast')).toHaveText('Not enough coins');
  expect(await shown(page)).toBe(1); // only the pre-roll
  expect(errors).toEqual([]);
});

test('SDK blocked (ad blocker): the game is fully playable without ads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(SDK_URL, (r) => r.abort('blockedbyclient'));
  await page.goto('/');
  await page.getByTestId('play').click({ timeout: 60_000 });
  await playLevel1(page);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('level')).toHaveText('Level 2', { timeout: 30_000 });
  expect(errors).toEqual([]);
});

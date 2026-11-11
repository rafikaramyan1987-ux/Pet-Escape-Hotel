import { test, expect, type Page } from '@playwright/test';
import { toasts, watchToasts } from './toasts';
import { playLevel1, returning, watchErrors } from './portal';

/** Y8 build (the shipped dist-y8/index.html) with a stand-in for https://cdn.y8.com/minimal-sdk/2-0/y8.min.js. */
const SDK_URL = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';
const STUB = `
(() => {
  const s8 = (window.__y8 = { calls: [], mode: 'ad', muted: [] });
  const app = () => document.getElementById('app');
  const sdk = {
    init: (appConfig, adConfig) => { s8.calls.push('init:' + JSON.stringify(appConfig) + ':' + JSON.stringify(adConfig)); setTimeout(adConfig.onReady, 50); },
    onAuth: (cb) => { s8.calls.push('onAuth'); setTimeout(() => cb(null, null), 50); },
    showAd: (o) => {
      s8.calls.push('showAd:' + o.type);
      if (s8.mode === 'noad') { setTimeout(() => o.adBreakDone && o.adBreakDone({ breakStatus: 'notReady' }), 50); return Promise.resolve(); }
      const play = (reward) => {
        o.beforeAd && o.beforeAd();
        // during the ad: the game must be paused (frozen) and blocked
        setTimeout(() => s8.muted.push(app().classList.contains('frozen') && app().classList.contains('blocked')), 100);
        setTimeout(() => {
          if (reward) o.adViewed && o.adViewed();
          o.afterAd && o.afterAd();
          o.adBreakDone && o.adBreakDone({ breakStatus: 'viewed' });
        }, 400);
      };
      if (o.type === 'reward') o.beforeReward && o.beforeReward(() => play(true));
      else play(false);
      return Promise.resolve();
    },
  };
  window.y8 = { sdk: () => sdk, emitReadyEvent: () => window.dispatchEvent(new Event('y8sdk.ready')) };
  window.dispatchEvent(new Event('y8sdk.ready'));
})();`;

type Y8Win = { __y8: { calls: string[]; mode: string; muted: boolean[] } };
const calls = (page: Page) => page.evaluate(() => (window as unknown as Y8Win).__y8.calls);
const ads = async (page: Page) => (await calls(page)).filter((c) => c.startsWith('showAd'));
const stub = (page: Page) => page.route(SDK_URL, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));

test('Y8 build: CDN SDK async in <head>, portal-snippet init before any ad, start on Play, next on Next, level 1 played, no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await stub(page);
  await page.goto('/');
  await expect(page.getByTestId('play')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => [s.parentElement!.tagName, s.getAttribute('src'), (s as HTMLScriptElement).async]))).toEqual([['HEAD', SDK_URL, true]]);
  await expect.poll(() => calls(page)).toEqual([
    'init:{"appId":"6af4b159ca1c6869a74e059b","autoLogin":true}:{"gameId":"292545","preloadAdBreaks":"on","sound":"on"}',
    'onAuth',
  ]);
  await page.waitForTimeout(500);
  expect(await ads(page)).toEqual([]); // nothing automatic
  await page.getByTestId('play').click();
  await expect.poll(() => ads(page)).toEqual(['showAd:start']);
  await playLevel1(page);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('level')).toHaveText('Level 2', { timeout: 30_000 });
  expect(await ads(page)).toEqual(['showAd:start', 'showAd:next']);
  expect(await page.evaluate(() => (window as unknown as Y8Win).__y8.muted)).toEqual([true, true]);
  // init came first: every ad call follows it
  expect((await calls(page))[0]).toMatch(/^init:/);
  expect(requests.filter((u) => !u.startsWith('http://localhost') && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([SDK_URL]);
  expect(errors).toEqual([]);
});

test('rewarded: the booster names its reward, granted after adViewed; no ad = "No ad available right now, try later"', async ({ page }) => {
  const errors = watchErrors(page);
  await stub(page);
  await returning(page);
  await page.goto('/');
  await page.getByTestId('play').click({ timeout: 60_000 });
  await expect(page.getByTestId('level')).toHaveText('Level 6', { timeout: 30_000 });
  const slot = page.getByTestId('booster-slot');
  await expect(slot.locator('.lbl')).not.toBeEmpty();
  await expect(slot.locator('.cost svg')).toHaveCount(1); // the ad badge
  await expect(slot.locator('.cost b')).toHaveCount(0);
  // no ad available: the game says so and goes on, no reward
  await page.evaluate(() => ((window as unknown as Y8Win).__y8.mode = 'noad'));
  await watchToasts(page);
  await slot.click();
  await expect.poll(() => toasts(page)).toContain('No ad available right now, try later');
  await expect(slot).not.toHaveClass(/off/);
  await expect(slot).toBeEnabled({ timeout: 15_000 });
  // an ad: the reward only after adViewed
  await page.evaluate(() => ((window as unknown as Y8Win).__y8.mode = 'ad'));
  await slot.click();
  await expect.poll(() => ads(page)).toEqual(['showAd:start', 'showAd:reward', 'showAd:reward']);
  await expect(slot).toHaveClass(/off/, { timeout: 10_000 }); // the +1 slot was granted and used
  await expect(page.getByTestId('level')).toHaveText('Level 6');
  expect(errors).toEqual([]);
});

test('window blur / hidden page pause the game, focus resumes it', async ({ page }) => {
  const errors = watchErrors(page);
  await stub(page);
  await page.goto('/');
  await page.getByTestId('play').click({ timeout: 60_000 });
  await expect(page.getByTestId('level')).toHaveText('Level 1', { timeout: 30_000 });
  await expect.poll(() => ads(page)).toEqual(['showAd:start']);
  await expect(page.locator('#app')).not.toHaveClass(/frozen/, { timeout: 10_000 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#app')).toHaveClass(/frozen/);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#app')).not.toHaveClass(/frozen/);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#app')).toHaveClass(/frozen/);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#app')).not.toHaveClass(/frozen/);
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

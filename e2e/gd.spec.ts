import { test, expect, type Page } from '@playwright/test';

/** GameDistribution build (the shipped dist-gd/index.html) with a stand-in for the GD HTML5 SDK. */
const SDK_URL = 'https://html5.api.gamedistribution.com/main.min.js';
const STUB = `
(() => {
  const gd = (window.__gd = { shown: [], mode: 'ok' });
  const ev = (name) => window.GD_OPTIONS.onEvent({ name });
  window.gdsdk = { showAd: (type) => {
    gd.shown.push(type || 'interstitial');
    if (gd.mode === 'fail') return Promise.reject(new Error('no fill'));
    return new Promise((res) => {
      ev('SDK_GAME_PAUSE');
      setTimeout(() => { if (type === 'rewarded') ev('SDK_REWARDED_WATCH_COMPLETE'); ev('SDK_GAME_START'); res(); }, 300);
    });
  } };
})();`;

type GdWin = { __gd: { shown: string[]; mode: string }; GD_OPTIONS: { gameId: string; onEvent: (e: { name: string }) => void } };
const shown = (page: Page) => page.evaluate(() => (window as unknown as GdWin).__gd.shown);

/** A returning player (levels 1-5 done) with no coins and no boosters left; today's gift already claimed. */
async function returning(page: Page) {
  await page.addInitScript(() => {
    const d = new Date();
    const last = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rooms = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [String(i), { stars: 3, bones: 0, best: 0 }]));
    localStorage.setItem('screw-and-rescue.save.v1', JSON.stringify({ v: 1, coins: 0, rooms, boosters: { slot: 0, undo: 0, hammer: 0 }, daily: { last, streak: 1 } }));
  });
}

test.beforeEach(async ({ page }) => {
  await page.route(SDK_URL, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
});

test('GD build: one file, GD_OPTIONS + SDK script, title, the first Play shows the pre-roll, then level 1', async ({ page }) => {
  const requests: string[] = [];
  const failed: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('play')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => (window as unknown as GdWin).GD_OPTIONS.gameId)).toBe('b25c8dbf41c5409aa7a8fabe7fc7d2e3');
  expect(await page.evaluate(() => document.getElementById('gamedistribution-jssdk')?.getAttribute('src'))).toBe(SDK_URL);
  expect(await shown(page)).toEqual([]); // no ad before a user action
  await page.getByTestId('play').click();
  await expect(page.getByTestId('level')).toHaveText('Level 1', { timeout: 30_000 });
  expect(await shown(page)).toEqual(['interstitial']);
  const own = requests.filter((u) => u.startsWith('http://localhost'));
  expect(own.map((u) => new URL(u).pathname)).toEqual(['/']);
  expect(requests.filter((u) => !u.startsWith('http://localhost') && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([SDK_URL]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test('SDK_GAME_PAUSE freezes the game and blocks input; SDK_GAME_START resumes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play').click({ timeout: 60_000 });
  await expect(page.getByTestId('level')).toHaveText('Level 1', { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as GdWin).GD_OPTIONS.onEvent({ name: 'SDK_GAME_PAUSE' }));
  await expect(page.locator('#app')).toHaveClass(/frozen/);
  await page.evaluate(() => (window as unknown as GdWin).GD_OPTIONS.onEvent({ name: 'SDK_GAME_START' }));
  await expect(page.locator('#app')).not.toHaveClass(/frozen/);
});

test('rewarded only from a rewarded button, granted after SDK_REWARDED_WATCH_COMPLETE', async ({ page }) => {
  await returning(page);
  await page.goto('/');
  await page.getByTestId('play').click({ timeout: 60_000 });
  await expect(page.getByTestId('level')).toHaveText('Level 6', { timeout: 30_000 });
  await expect(page.locator('[data-booster=slot] .cost svg')).toHaveCount(1); // the ad badge
  await page.getByTestId('booster-slot').click();
  await expect.poll(() => shown(page)).toEqual(['interstitial', 'rewarded']);
  // the reward was given: the +1 slot booster is used for this attempt
  await expect(page.getByTestId('booster-slot')).toHaveClass(/off/, { timeout: 10_000 });
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
});

test('rewarded ad fails: "No ad available right now, try later" for 2.5 s, no reward', async ({ page }) => {
  await returning(page);
  await page.goto('/');
  await page.getByTestId('play').click({ timeout: 60_000 });
  await expect(page.getByTestId('level')).toHaveText('Level 6', { timeout: 30_000 });
  await page.evaluate(() => ((window as unknown as GdWin).__gd.mode = 'fail'));
  await page.getByTestId('booster-slot').click();
  await expect(page.locator('#toast')).toHaveText('No ad available right now, try later');
  await expect(page.getByTestId('booster-slot')).toBeDisabled();
  await expect(page.getByTestId('booster-slot')).not.toHaveClass(/off/);
  await expect(page.getByTestId('booster-slot')).toBeEnabled({ timeout: 5_000 });
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
});

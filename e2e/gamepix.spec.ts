import { test, expect, type Page } from '@playwright/test';

/** GamePix build (the shipped dist-gamepix/index.html) with a stand-in for the GamePix SDK v3. */
const SDK_URL = 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js';
const STUB = `
(() => {
  const gp = (window.__gp = { calls: [], handlers: {}, reward: 'ok', manual: window.GamePixConfig && window.GamePixConfig.lifecycle });
  const fire = (n) => gp.handlers[n] && gp.handlers[n]();
  window.GamePix = {
    lifecycle: {
      loading: (p) => gp.calls.push('loading:' + p),
      loaded: () => { gp.calls.push('loaded'); return new Promise((r) => setTimeout(() => { gp.calls.push('loaded-resolved'); r(); }, 300)); },
      gameStart: () => gp.calls.push('gameStart'),
    },
    events: { on: (n, fn) => { gp.handlers[n] = fn; } },
    ads: {
      interstitial: async () => { gp.calls.push('interstitial'); return { success: true }; },
      reward: () => {
        gp.calls.push('reward');
        if (gp.reward === 'nofill') return Promise.resolve({ success: false, message: 'nofill' });
        fire('pause');
        gp.mutedDuringAd = document.getElementById('app').classList.contains('frozen');
        return new Promise((r) => setTimeout(() => { fire('resume'); r({ success: gp.reward === 'ok' }); }, 300));
      },
    },
    lang: () => gp.lang || 'en',
    happyMoment: (n) => gp.calls.push('happy:' + n),
    sadMoment: (n) => gp.calls.push('sad:' + n),
  };
})();`;

type Gp = { __gp: { calls: string[]; handlers: Record<string, () => void>; reward: string; manual: string; lang?: string; mutedDuringAd?: boolean } };
const gp = (page: Page) => page.evaluate(() => (window as unknown as Gp).__gp);

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

test('GamePix build: manual lifecycle (loading → loaded() before the title → gameStart on level 1), happy moment, no interstitial within 2 minutes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('play')).toBeVisible({ timeout: 60_000 });
  let s = await gp(page);
  expect(s.manual).toBe('manual');
  const loading = s.calls.filter((c) => c.startsWith('loading:')).map((c) => Number(c.slice(8)));
  expect(loading.at(-1)).toBe(100);
  expect([...loading].sort((a, b) => a - b)).toEqual(loading);
  expect(s.calls.slice(-2)).toEqual(['loaded', 'loaded-resolved']); // the title only after loaded() resolved
  await page.getByTestId('play').click();
  await expect(page.getByTestId('level')).toHaveText('Level 1', { timeout: 30_000 });
  s = await gp(page);
  expect(s.calls.at(-1)).toBe('gameStart');
  expect(s.calls).not.toContain('interstitial'); // no pre-roll on GamePix
  // level 1 by following the tutorial hand
  for (let i = 0; i < 24 && !(await page.getByTestId('result').isVisible()); i++) {
    await page.waitForTimeout(500);
    const box = await page.locator('.hand').boundingBox();
    if (box) await page.mouse.click(box.x + 14, box.y + 4);
  }
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  expect((await gp(page)).calls).toContain('happy:level_complete');
  await page.getByTestId('next').click();
  await expect(page.getByTestId('level')).toHaveText('Level 2');
  expect((await gp(page)).calls.filter((c) => c === 'interstitial' || c === 'gameStart')).toEqual(['gameStart']);
  expect(errors).toEqual([]);
});

test('language from GamePix.lang()', async ({ page }) => {
  await page.route(SDK_URL, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB.replace("gp.lang || 'en'", "'fr'") }));
  await page.goto('/');
  await expect(page.getByTestId('play')).toHaveText('Jouer', { timeout: 60_000 });
  await page.getByTestId('play').click();
  await expect(page.getByTestId('level')).toHaveText('Niveau 1', { timeout: 30_000 });
});

test('pause / resume and soundOff / soundOn: frozen + muted, idempotent', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play').click({ timeout: 60_000 });
  await expect(page.getByTestId('level')).toHaveText('Level 1', { timeout: 30_000 });
  const fire = (n: string) => page.evaluate((x) => (window as unknown as Gp).__gp.handlers[x](), n);
  await fire('pause');
  await fire('pause');
  await expect(page.locator('#app')).toHaveClass(/frozen/);
  await fire('resume');
  await expect(page.locator('#app')).not.toHaveClass(/frozen/);
  await fire('soundOff');
  await fire('soundOn');
  await fire('soundOn');
  await expect(page.locator('#app')).not.toHaveClass(/frozen/);
});

test('reward: granted on success, nothing on cancel or no-fill (and the "no ad" message)', async ({ page }) => {
  await returning(page);
  await page.goto('/');
  await page.getByTestId('play').click({ timeout: 60_000 });
  await expect(page.getByTestId('level')).toHaveText('Level 6', { timeout: 30_000 });
  // cancelled
  await page.evaluate(() => ((window as unknown as Gp).__gp.reward = 'cancel'));
  await page.getByTestId('booster-slot').click();
  await expect(page.locator('#toast')).toHaveText('No ad available right now, try later', { timeout: 10_000 });
  expect((await gp(page)).mutedDuringAd).toBe(true);
  await expect(page.getByTestId('booster-slot')).not.toHaveClass(/off/);
  await expect(page.getByTestId('booster-slot')).toBeEnabled({ timeout: 5_000 });
  // no fill
  await page.evaluate(() => ((window as unknown as Gp).__gp.reward = 'nofill'));
  await page.getByTestId('booster-slot').click();
  await expect(page.locator('#toast')).toHaveText('No ad available right now, try later');
  await expect(page.getByTestId('booster-slot')).not.toHaveClass(/off/);
  await expect(page.getByTestId('booster-slot')).toBeEnabled({ timeout: 5_000 });
  // completed
  await page.evaluate(() => ((window as unknown as Gp).__gp.reward = 'ok'));
  await page.getByTestId('booster-slot').click();
  await expect(page.getByTestId('booster-slot')).toHaveClass(/off/, { timeout: 10_000 });
  expect((await gp(page)).calls.filter((c) => c === 'reward')).toHaveLength(3);
  await expect(page.locator('#app')).not.toHaveClass(/frozen/);
});

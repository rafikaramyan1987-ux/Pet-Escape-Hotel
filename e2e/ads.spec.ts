import { test, expect } from '@playwright/test';

/**
 * Rewarded "continue" flow on an e2e-only CrazyGames build (VITE_E2E=1 adds the test tooling: `?level=`,
 * `window.__game`; it is never shipped). The real CrazyGames build is checked in crazygames.spec.ts.
 */
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

type G = {
  game: {
    puzzle: { history: unknown[]; tray: unknown[]; plankGone: boolean[]; status: string; freeScrews(): number[] };
    tap(id: number): void;
    mode: string;
    lostReason: string;
    fails: number;
  };
};

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('tray full: "watch an ad for +1 slot" once per level (only a completed ad rewards), retry, hint after 2 fails', async ({ page }) => {
  // a stand-in CrazyGames SDK whose rewarded ads complete
  await page.route(SDK_URL, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.addInitScript(() => {
    (window as unknown as { __ads: number }).__ads = 0;
    (window as unknown as { CrazyGames: unknown }).CrazyGames = { SDK: {
      init: async () => undefined,
      ad: { requestAd: (_t: string, cb: { adStarted?: () => void; adFinished?: () => void }) => { (window as unknown as { __ads: number }).__ads++; cb.adStarted?.(); setTimeout(() => cb.adFinished?.(), 50); } },
      game: {},
    } };
  });
  await page.goto('/?q=low&level=33');
  await expect(page.getByTestId('level')).toHaveText('Level 33', { timeout: 60_000 });
  // play badly on purpose: always a screw that has no active box (it goes to the tray) until the tray is full
  const playBadly = () => page.evaluate(() => {
    const x = (window as unknown as { __game: G }).__game.game;
    const q = () => x.puzzle as unknown as { freeScrews(): number[]; screws: { color: string }[]; boxes: ({ color: string } | null)[]; status: string; iced: boolean[] };
    for (let k = 0; k < 200 && q().status === 'play'; k++) {
      const f = q().freeScrews();
      const wrong = f.filter((id) => q().iced[id] || !q().boxes.some((b) => b && b.color === q().screws[id].color));
      x.tap((wrong.length ? wrong : f)[0]);
    }
    return x.puzzle.status === 'lost' ? x.lostReason : x.puzzle.status;
  });
  expect(await playBadly()).toBe('tray');
  await expect(page.getByTestId('lost-title')).toHaveText('Tray full!', { timeout: 90_000 });
  await expect(page.getByTestId('continue')).toHaveText('Watch an ad for +1 tray slot and continue');
  await page.getByTestId('continue').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.game.mode)).toBe('play');
  expect(await page.evaluate(() => (window as unknown as { __ads: number }).__ads)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.game.puzzle.tray.length)).toBe(5);
  // second loss: the ad continue was used for this level, only retry
  expect(await playBadly()).not.toBe('play');
  await expect(page.getByTestId('lost')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('continue')).toHaveCount(0);
  // retry is instant (timed in the page: the headless browser renders in software)
  const ms = await page.evaluate(() => {
    const t = performance.now();
    (document.querySelector('[data-testid=retry]') as HTMLElement).click();
    return performance.now() - t;
  });
  expect(ms).toBeLessThan(1000);
  await expect(page.getByTestId('lost')).toHaveCount(0);
  // two fails on this level → the hint bulb (never automatic)
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.game.fails)).toBe(2);
  await expect(page.getByTestId('hint')).toBeVisible();
  await expect(page.locator('.hand')).toHaveCount(0);
  await page.getByTestId('hint').click();
  await expect(page.locator('.hand')).toBeVisible();
  // still once per level after a retry
  await playBadly();
  await expect(page.getByTestId('lost')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('continue')).toHaveCount(0);
});

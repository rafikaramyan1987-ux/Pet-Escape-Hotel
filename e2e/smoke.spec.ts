import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __game?: { state(): { level: number; mode: string; taps: number; tray: number } };
  }
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('level 1 by real taps on the screws: tip, tutorial hand, rescue, next level', async ({ page }) => {
  await page.goto('/?q=low');
  await expect(page).toHaveTitle('Screw & Rescue');
  await expect(page.getByTestId('level')).toHaveText('Level 1', { timeout: 60_000 });
  await expect(page.getByTestId('tip')).toHaveText('Tap a screw whose colour has a box at the top');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  // tap where the tutorial hand points until the pet is free (the hand's fingertip sits on the best next screw)
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__game!.state().mode)) === 'play'; i++) {
    const before = (await page.evaluate(() => window.__game!.state())).taps;
    await page.waitForTimeout(450);
    const box = await page.locator('.hand').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + 14, box!.y + 4);
    await page.waitForFunction((n) => window.__game!.state().taps > n, before, { timeout: 10_000 });
  }
  expect((await page.evaluate(() => window.__game!.state())).mode).toBe('won');
  await expect(page.getByTestId('next')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('next').click();
  await expect(page.getByTestId('level')).toHaveText('Level 2');
});

test('the solver bot clears levels 1-5 in the real game', async ({ page }) => {
  await page.goto('/?q=low&level=1&auto=1&speed=6');
  await page.waitForFunction(() => window.__game?.state().level === 5 && window.__game.state().mode === 'won', null, { timeout: 200_000 });
  expect((await page.evaluate(() => window.__game!.state())).tray).toBe(0);
});

// ─── Phase B: boosters, continue, menu ─────────────────────────────────────
type G = {
  game: {
    puzzle: { history: unknown[]; tray: unknown[]; plankGone: boolean[]; status: string; freeScrews(): number[] };
    tap(id: number): void;
    hintScrew(): number;
    retry(): void;
    view: { screenOf(id: number, w: number, h: number): { x: number; y: number } };
    save: { coins: number; boosters: Record<string, number> };
    mode: string;
    lostReason: string;
    fails: number;
  };
};
const g = (page: import('@playwright/test').Page) => page.evaluate.bind(page);

test('boosters: undo, +1 slot and hammer', async ({ page }) => {
  await page.goto('/?q=low&level=6');
  await expect(page.getByTestId('level')).toHaveText('Level 6', { timeout: 60_000 });
  await g(page)(() => {
    const x = (window as unknown as { __game: G }).__game.game;
    x.tap(x.hintScrew());
  });
  await page.getByTestId('booster-undo').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.game.puzzle.history.length)).toBe(0);
  await page.getByTestId('booster-slot').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.game.puzzle.tray.length)).toBe(6);
  // hammer: arm it, then tap a plank (where one of its free screws is)
  await page.getByTestId('booster-hammer').click();
  const at = await page.evaluate(() => {
    const x = (window as unknown as { __game: G }).__game.game;
    return x.view.screenOf(x.puzzle.freeScrews()[0], innerWidth, innerHeight);
  });
  await page.mouse.click(at.x + 20, at.y);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.game.puzzle.plankGone.filter(Boolean).length)).toBe(1);
  // all three free boosters are used up: the next costs coins, or shows the ad badge
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.game.save.boosters)).toEqual({ slot: 0, undo: 0, hammer: 0 });
});

test('tray full: "watch an ad for +1 slot" once per level (only a completed ad rewards), retry, hint after 2 fails', async ({ page }) => {
  // a stand-in ad SDK whose rewarded ads complete (the web build has none: there the button says no ad is available)
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
  await expect(page.getByTestId('lost-title')).toHaveText('Tray full!', { timeout: 20_000 });
  await expect(page.getByTestId('continue')).toHaveText('Watch an ad for +1 tray slot and continue');
  await page.getByTestId('continue').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.game.mode)).toBe('play');
  expect(await page.evaluate(() => (window as unknown as { __ads: number }).__ads)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.game.puzzle.tray.length)).toBe(5);
  // second loss: the ad continue was used for this level, only retry
  expect(await playBadly()).not.toBe('play');
  await expect(page.getByTestId('lost')).toBeVisible({ timeout: 20_000 });
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
  await expect(page.getByTestId('lost')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('continue')).toHaveCount(0);
});

test('no ad SDK (web build): the ad continue says no ad is available and rewards nothing', async ({ page }) => {
  await page.goto('/?q=low&level=12');
  await expect(page.getByTestId('level')).toHaveText('Level 12', { timeout: 60_000 });
  await page.evaluate(() => {
    const x = (window as unknown as { __game: G }).__game.game;
    const q = () => x.puzzle as unknown as { freeScrews(): number[]; screws: { color: string }[]; boxes: ({ color: string } | null)[]; status: string; iced: boolean[] };
    for (let k = 0; k < 200 && q().status === 'play'; k++) {
      const f = q().freeScrews();
      const wrong = f.filter((id) => q().iced[id] || !q().boxes.some((b) => b && b.color === q().screws[id].color));
      x.tap((wrong.length ? wrong : f)[0]);
    }
  });
  await expect(page.getByTestId('lost')).toBeVisible({ timeout: 20_000 });
  if ((await page.getByTestId('continue').count()) > 0) {
    await page.getByTestId('continue').click();
    await expect(page.locator('#toast')).toHaveText('No ad available right now, try later');
    expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.game.mode)).toBe('lost');
  }
});

test('a new mechanic gets a one-screen tip on its first level', async ({ page }) => {
  await page.goto('/?q=low&level=9');
  await expect(page.getByTestId('mechanic-tip')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('mechanic-tip')).toContainText('Ice');
  await page.getByTestId('gotit').click();
  await expect(page.getByTestId('mechanic-tip')).toHaveCount(0);
});

test('menu: pets, shop, daily gift, settings (French)', async ({ page }) => {
  await page.goto('/?q=low&level=3');
  await expect(page.getByTestId('level')).toHaveText('Level 3', { timeout: 60_000 });
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('menu-panel')).toBeVisible();
  await expect(page.locator('.petcell')).toHaveCount(18);
  await page.getByTestId('tab-daily').click();
  const before = await page.evaluate(() => (window as unknown as { __game: G }).__game.game.save.coins);
  await page.getByTestId('claim').click();
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.game.save.coins)).toBe(before + 20);
  await page.getByTestId('tab-shop').click();
  await page.getByTestId('item-party').click(); // 80 coins: not enough yet
  await expect(page.getByTestId('item-party')).not.toHaveClass(/sel/);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('lang-fr').click();
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('level')).toHaveText('Niveau 3');
});

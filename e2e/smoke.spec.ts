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

test('level 1 by real taps on the screws: tutorial, rescue, next level', async ({ page }) => {
  await page.goto('/?q=low');
  await expect(page).toHaveTitle('Screw & Rescue');
  await expect(page.getByTestId('level')).toHaveText('Level 1', { timeout: 60_000 });
  await expect(page.getByTestId('tutorial')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  // tap where the tutorial hand points, three times (the hand's fingertip sits on the next screw)
  for (let i = 0; i < 3; i++) {
    const before = (await page.evaluate(() => window.__game!.state())).taps;
    await page.waitForTimeout(400);
    const box = await page.locator('.hand').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + 14, box!.y + 4);
    await page.waitForFunction((n) => window.__game!.state().taps > n, before, { timeout: 10_000 });
  }
  await expect(page.getByTestId('next')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('next').click();
  await expect(page.getByTestId('level')).toHaveText('Level 2');
});

test('the solver bot clears levels 1-5 in the real game', async ({ page }) => {
  await page.goto('/?q=low&level=1&auto=1&speed=3');
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

test('a lost level offers "continue with +1 slot"', async ({ page }) => {
  await page.goto('/?q=low&level=40');
  await expect(page.getByTestId('level')).toHaveText('Level 40', { timeout: 60_000 });
  // play badly (always the last free screw) until the tray overflows
  for (let attempt = 0; attempt < 6; attempt++) {
    const lost = await page.evaluate(() => {
      const x = (window as unknown as { __game: G }).__game.game;
      while (x.puzzle.status === 'play') {
        const f = x.puzzle.freeScrews();
        x.tap(f[(f.length * 7919 + x.puzzle.history.length * 31) % f.length]);
      }
      return x.puzzle.status === 'lost';
    });
    if (lost) break;
    await page.evaluate(() => (window as unknown as { __game: G }).__game.game.retry());
  }
  await expect(page.getByTestId('lost')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('continue').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: G }).__game.game.mode)).toBe('play');
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.game.puzzle.tray.length)).toBe(6);
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

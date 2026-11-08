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
  await page.goto('/?q=low&level=1&auto=1');
  await page.waitForFunction(() => window.__game?.state().level === 5 && window.__game.state().mode === 'won', null, { timeout: 200_000 });
  expect((await page.evaluate(() => window.__game!.state())).tray).toBe(0);
});

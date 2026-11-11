import { expect, type Page } from '@playwright/test';

/** Console errors and uncaught page errors of a page (smoke tests expect none). */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Play level 1 of a shipped build (no test hooks) by real clicks where the tutorial hand points (its fingertip sits on
 * the best next screw), until the result card's Next button shows.
 */
export async function playLevel1(page: Page): Promise<void> {
  await expect(page.getByTestId('level')).toHaveText('Level 1', { timeout: 60_000 });
  const next = page.getByTestId('next');
  for (let i = 0; i < 40 && !(await next.isVisible()); i++) {
    await page.waitForTimeout(700);
    const hand = page.locator('.hand');
    if (!(await hand.isVisible())) continue;
    const box = await hand.boundingBox();
    if (box) await page.mouse.click(box.x + 14, box.y + 4);
  }
  await expect(next).toBeVisible({ timeout: 30_000 });
}

/** A returning player (levels 1-5 done) with no coins and no boosters left; today's gift already claimed. */
export async function returning(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const d = new Date();
    const last = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rooms = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [String(i), { stars: 3, bones: 0, best: 0 }]));
    localStorage.setItem('screw-and-rescue.save.v1', JSON.stringify({ v: 1, coins: 0, rooms, boosters: { slot: 0, undo: 0, hammer: 0 }, daily: { last, streak: 1 } }));
  });
}

import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __art?: { ready: boolean; renderAt(t: number): void };
  }
}

/** Phase 1 (art direction): the showcase lobby boots, renders WebGL, shows the HUD and fits a 390px phone. */
test('showcase lobby renders with HUD and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?t=1&q=low');
  await page.waitForFunction(() => window.__art?.ready === true, null, { timeout: 120_000 });
  await expect(page).toHaveTitle('Pet Escape Hotel');
  await expect(page.getByTestId('pet-dog')).toBeVisible();
  await expect(page.getByTestId('ability')).toContainText('Dig');
  // the canvas is not blank: sample a few pixels of the rendered frame
  const lit = await page.evaluate(() => {
    const c = document.getElementById('view') as HTMLCanvasElement;
    const g = c.getContext('webgl2')!;
    const px = new Uint8Array(4);
    let sum = 0;
    for (const [x, y] of [[0.5, 0.5], [0.4, 0.6], [0.6, 0.4]]) {
      g.readPixels(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
      sum += px[0] + px[1] + px[2];
    }
    return sum;
  });
  expect(lit).toBeGreaterThan(60);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __game?: { state(): { mode: string; status?: string; room?: string; active?: string }; step(dt: number, n?: number): void; start(id: string, auto?: boolean): void };
  }
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('home → play: tip, HUD, switching pets, tap to move, pause', async ({ page }) => {
  await page.goto('/?q=low');
  await expect(page).toHaveTitle('Pet Escape Hotel');
  await expect(page.getByTestId('play')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByTestId('play').click();
  await page.getByTestId('tip-ok').click();
  await expect(page.getByTestId('pet-dog')).toBeVisible();
  await expect(page.getByTestId('ability')).toContainText('Dig');
  // tap the floor in front of the dog: it walks
  await page.waitForFunction(() => window.__game!.state().mode === 'play', null, { timeout: 30_000 });
  await page.mouse.click(195, 330);
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('resume')).toBeVisible();
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('pause')).toBeVisible();
});

test('the playtest bot escapes room 1-1 in the real game', async ({ page }) => {
  await page.goto('/?q=low&room=1-1&auto=1');
  await page.waitForFunction(() => window.__game?.state().mode === 'won', null, { timeout: 120_000 });
  await expect(page.getByTestId('next')).toBeVisible();
});

test('shop try-on and French', async ({ page }) => {
  await page.goto('/?q=low');
  await page.getByTestId('shop').click();
  await expect(page.getByTestId('tryon')).toBeVisible();
  await page.goto('/?q=low');
  await page.getByRole('button', { name: /settings/i }).click();
  await page.getByTestId('lang-fr').click();
  await page.getByTestId('close').click();
  await expect(page.getByTestId('play')).toContainText(/Jouer|Continuer/);
});

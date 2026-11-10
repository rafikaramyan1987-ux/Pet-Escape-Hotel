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

test('web build: no ads at all — no continue-with-ad button, no ad badge on boosters', async ({ page }) => {
  // a returning player with no coins and no boosters left
  await page.addInitScript(() => {
    const d = new Date();
    const last = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('screw-and-rescue.save.v1', JSON.stringify({ v: 1, coins: 0, rooms: {}, boosters: { slot: 0, undo: 0, hammer: 0 }, daily: { last, streak: 1 } }));
  });
  await page.goto('/?q=low&level=12');
  await expect(page.getByTestId('level')).toHaveText('Level 12', { timeout: 60_000 });
  await expect(page.locator('[data-booster] .cost svg')).toHaveCount(3); // coin icons, not the ad icon
  await page.getByTestId('booster-slot').click();
  await expect(page.locator('#toast')).toHaveText('Not enough coins');
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
  await expect(page.getByTestId('continue')).toHaveCount(0);
  await expect(page.getByTestId('retry')).toBeVisible();
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
  await expect(page.locator('[data-lang]')).toHaveCount(10);
  await page.getByTestId('lang-fr').click();
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('level')).toHaveText('Niveau 3');
  // the choice is saved
  await page.reload();
  await expect(page.getByTestId('level')).toHaveText('Niveau 3', { timeout: 60_000 });
});

/** Every visible text element stays inside the screen and inside its own box (no clipped / overflowing text). */
async function overflow(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    const W = innerWidth;
    const H = innerHeight;
    for (const el of document.querySelectorAll<HTMLElement>('#ui *, #toast')) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own) continue;
      if (r.left < -1 || r.right > W + 1 || r.bottom > H + 1) bad.push(`outside: ${el.className || el.tagName} "${el.textContent!.trim().slice(0, 40)}"`);
      if (el.scrollWidth > el.clientWidth + 2 && st.overflow !== 'visible') bad.push(`clipped: ${el.className || el.tagName} "${el.textContent!.trim().slice(0, 40)}"`);
    }
    return bad;
  });
}

for (const lang of ['de', 'ru', 'fr', 'it', 'es', 'pt', 'nl', 'pl', 'tr']) {
  test(`text fits at 390x844 in ${lang}: HUD, tips, boosters, menu panels, fail card, mechanic tip`, async ({ page }) => {
    const seen: Record<string, string[]> = {};
    const check = async (where: string) => {
      const b = await overflow(page);
      if (b.length) seen[where] = b;
    };
    await page.goto(`/?q=low&level=3&lang=${lang}`);
    await expect(page.getByTestId('tip')).toBeVisible({ timeout: 60_000 });
    await check('level 3');
    for (const tab of ['pets', 'shop', 'daily', 'settings']) {
      await page.getByTestId('menu').click();
      await page.getByTestId(`tab-${tab}`).click();
      await check(`menu ${tab}`);
      await page.getByTestId('resume').click();
    }
    await page.goto(`/?q=low&level=35&lang=${lang}`);
    await expect(page.getByTestId('mechanic-tip')).toBeVisible({ timeout: 60_000 });
    await check('mechanic tip');
    await page.getByTestId('gotit').click();
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
    await check('fail card');
    await page.screenshot({ path: `test-results/fit-${lang}-fail.png` });
    expect(seen).toEqual({});
  });
}

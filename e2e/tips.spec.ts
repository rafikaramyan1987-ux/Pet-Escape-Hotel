import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

/**
 * The tutorial tip (levels 1-4) never covers the board or a control, in every language and screen shape:
 * its box must not intersect the projected screen bounds of any screw, plank, the pet, the toolboxes, the tray / queue,
 * or any HUD control, and it wraps to at most 2 lines inside the screen. One screenshot per case goes to
 * test-results/tips/ (a CI artifact).
 * Also: the other overlays that sit on the board during play (moves pill, tier badge, top bar, boosters, hint button,
 * toasts) never cover a screw, plank, the pet, a toolbox or the tray.
 */
const LANGS = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'tr'];
/** every message the game shows as a toast during play (src: hud.toast(t(…))), the longest in each language */
const TOAST_KEYS = ['bossLevel', 'hammerHint', 'lockedHint', 'noAd', 'notEnough', 'nothingToUndo', 'rotateHint', 'stickyHint'];
const longestToast = (lang: string) => {
  const d = JSON.parse(readFileSync(`src/i18n/${lang}.json`, 'utf8')) as Record<string, string>;
  return TOAST_KEYS.map((k) => d[k]).sort((a, b) => b.length - a.length)[0];
};
const SIZES: [number, number][] = [[360, 640], [390, 844], [412, 915], [768, 1024], [844, 390], [1280, 720]];

type R = { kind: string; x0: number; y0: number; x1: number; y1: number };
type G = {
  game: { canvas: HTMLCanvasElement; view: { screenRects(w: number, h: number): R[] }; hud: { toast(m: string, s?: number): void } };
  step(dt: number, n?: number): void;
  start(id: number, auto?: boolean): void;
};

const hit = (a: R, b: R) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1;

/** Board parts (projected 3D bounds, page coordinates) and the visible HUD controls of the current frame. */
async function scene(page: Page) {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: G }).__game.game;
    const c = g.canvas.getBoundingClientRect();
    const board = g.view.screenRects(c.width, c.height).map((r) => ({ ...r, x0: r.x0 + c.left, x1: r.x1 + c.left, y0: r.y0 + c.top, y1: r.y1 + c.top }));
    const box = (kind: string, el: Element) => {
      const b = el.getBoundingClientRect();
      return { kind, x0: b.left, y0: b.top, x1: b.right, y1: b.bottom };
    };
    const shown = (el: Element) => {
      const b = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05;
    };
    const controls = [...document.querySelectorAll('.hud button, .hud .card, .hud .tierbadge')]
      .filter((el) => !el.matches('[data-testid=tip]') && shown(el))
      .map((el) => box((el as HTMLElement).dataset.testid ?? el.className, el));
    const tipEl = document.querySelector('[data-testid=tip]');
    let tip = null;
    if (tipEl) {
      const st = getComputedStyle(tipEl);
      const inner = (tipEl as HTMLElement).clientHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
      tip = { ...box('tip', tipEl), lines: Math.round(inner / parseFloat(st.lineHeight)), shown: shown(tipEl), gone: tipEl.classList.contains('gone') };
    }
    return { board, controls, tip, vw: innerWidth, vh: innerHeight };
  });
}

const steps = (page: Page, n: number) => page.evaluate((n) => (window as unknown as { __game: G }).__game.step(1 / 30, n), n);

for (const [w, h] of SIZES) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < h, deviceScaleFactor: 1 });

    for (const lang of LANGS) {
      test(`tip never covers the board or a control: levels 1-4, ${lang}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`/?q=low&capture=1&level=1&lang=${lang}`);
        await page.waitForFunction(() => (window as unknown as { __game?: G }).__game, null, { timeout: 120_000 });
        await page.evaluate(() => document.fonts.ready);
        const problems: string[] = [];
        for (const level of [1, 2, 3, 4]) {
          await page.evaluate((l) => (window as unknown as { __game: G }).__game.start(l, false), level);
          // the first frame, and 3 s in (before the 5 s fade): the board is framed above the tip the whole time
          for (const frames of [1, 90]) {
            await steps(page, frames);
            const s = await scene(page);
            const tip = s.tip;
            if (!tip) {
              problems.push(`level ${level}: no tip`);
              continue;
            }
            if (!tip.shown || tip.gone) problems.push(`level ${level} @${frames}f: tip already hidden`);
            if (tip.lines > 2) problems.push(`level ${level}: tip wraps to ${tip.lines} lines`);
            if (tip.x0 < 0 || tip.y0 < 0 || tip.x1 > s.vw + 0.5 || tip.y1 > s.vh + 0.5) problems.push(`level ${level}: tip leaves the screen ${JSON.stringify(tip)}`);
            for (const r of [...s.board, ...s.controls]) if (hit(tip, r)) problems.push(`level ${level} @${frames}f: tip covers ${r.kind}`);
            if (s.board.filter((r) => r.kind.startsWith('screw')).length === 0) problems.push(`level ${level}: no screws measured`);
          }
          await page.screenshot({ path: `test-results/tips/${w}x${h}/${lang}-level${level}.png` });
        }
        expect(problems).toEqual([]);
        expect(errors).toEqual([]);
      });
    }

    test('the tip fades after 5 s or the first valid tap, a tap dismisses it, and it never takes a tap from a screw', async ({ page }) => {
      await page.goto('/?q=low&capture=1&level=3&lang=fr');
      await page.waitForFunction(() => (window as unknown as { __game?: G }).__game, null, { timeout: 120_000 });
      const tip = page.getByTestId('tip');
      await steps(page, 30 * 4.8);
      await expect(tip).not.toHaveClass(/gone/);
      await steps(page, 30 * 0.4);
      await expect(tip).toHaveClass(/gone/);
      expect(await tip.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
      // first valid tap
      await page.evaluate(() => (window as unknown as { __game: G }).__game.start(3, false));
      await steps(page, 2);
      await expect(tip).not.toHaveClass(/gone/);
      await page.evaluate(() => {
        const x = (window as unknown as { __game: { game: { tap(id: number): void; hintScrew(): number } } }).__game.game;
        x.tap(x.hintScrew());
      });
      await expect(tip).toHaveClass(/gone/);
      // a tap on the tip dismisses it
      await page.evaluate(() => (window as unknown as { __game: G }).__game.start(4, false));
      await steps(page, 2);
      await tip.click();
      await expect(tip).toHaveClass(/gone/);
    });

    for (const lang of LANGS) {
      test(`other overlays (top bar, moves pill, tier badge, boosters, hint button, toasts) never cover the board: ${lang}`, async ({ page }) => {
        await page.goto(`/?q=low&capture=1&level=1&lang=${lang}`);
        await page.waitForFunction(() => (window as unknown as { __game?: G }).__game, null, { timeout: 120_000 });
        await page.evaluate(() => document.fonts.ready);
        const problems: string[] = [];
        const toast = longestToast(lang);
        // tutorial levels, hard and very hard levels (tier badge), boss levels (their toast), the biggest levels
        for (const level of [1, 3, 5, 9, 15, 20, 30, 45, 60]) {
          await page.evaluate((l) => (window as unknown as { __game: G }).__game.start(l, false), level);
          await steps(page, 3);
          await page.evaluate((m) => (window as unknown as { __game: G }).__game.game.hud.toast(m, 0), toast);
          await page.evaluate(() => document.querySelector('[data-act=hint]')?.removeAttribute('hidden'));
          await steps(page, 8);
          const s = await scene(page);
          const tb = await page.locator('#toast').boundingBox();
          const overlays = [...s.controls, ...(tb ? [{ kind: 'toast', x0: tb.x, y0: tb.y, x1: tb.x + tb.width, y1: tb.y + tb.height }] : [])];
          if (tb && (tb.x < 0 || tb.x + tb.width > s.vw + 0.5)) problems.push(`level ${level}: toast leaves the screen`);
          for (const o of overlays) for (const r of s.board) if (hit(o, r)) problems.push(`level ${level}: ${o.kind} covers ${r.kind}`);
          if ([1, 15, 60].includes(level)) await page.screenshot({ path: `test-results/tips/${w}x${h}/${lang}-overlays-level${level}.png` });
          await page.evaluate(() => (window as unknown as { __game: G }).__game.game.hud.toast(''));
        }
        expect(problems).toEqual([]);
      });
    }
  });
}

// GameMonetize thumbnails 512x384, 512x512, 512x340 (JPG, < 300 KB each), rendered from the game's cover scene (level 4
// cage, the three pets, `?cover=…` as scripts/shoot.mjs) WITHOUT the title logo or any other text (GameMonetize: no text
// or logo on the images). Rendered at 2x, downscaled with Lanczos.
//   npm run build && node scripts/gamemonetize/images.mjs
// Out: submission-gamemonetize/screw-and-rescue-{512x384,512x512,512x340}.jpg
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { chromium } from 'playwright';
import { jpegInfo } from '../media-info.mjs';

const OUT = 'submission-gamemonetize';
const PORT = Number(process.env.ART_PORT ?? 4183);
const SIZES = [
  [512, 384, 'landscape'],
  [512, 512, 'square'],
  [512, 340, 'landscape'],
];
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${PORT}/`;
for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [w, h, cover] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w * 2, height: h * 2 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.goto(`${base}?capture=1&q=high&level=4&auto=1&cover=${cover}`);
    await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
    await page.evaluate(() => window.__game.step(1 / 30, 78));
    // no text or logo: the cover logo, the HUD and the toast go
    await page.evaluate(() => {
      document.querySelectorAll('.logo, #ui, #toast').forEach((e) => e.remove());
      window.__game.step(1 / 30);
    });
    await page.waitForTimeout(300);
    const png = `${OUT}/.tmp-${w}x${h}.png`;
    await page.screenshot({ path: png });
    await page.close();
    const jpg = `${OUT}/screw-and-rescue-${w}x${h}.jpg`;
    execFileSync('convert', [png, '-filter', 'Lanczos', '-resize', `${w}x${h}!`, '-strip', '-sampling-factor', '4:2:0', '-quality', '90', '-interlace', 'JPEG', jpg]);
    rmSync(png);
    const i = jpegInfo(jpg);
    if (i.w !== w || i.h !== h || i.bytes >= 300 * 1024) throw new Error(`${jpg}: ${i.w}x${i.h}, ${i.bytes} bytes`);
    console.log(`${jpg} (${(statSync(jpg).size / 1024).toFixed(0)} KB)`);
  }
} finally {
  await browser.close();
  server.kill();
}

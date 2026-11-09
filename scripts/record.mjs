// Records levels 1-5 played by the solver bot on a 390x844 portrait viewport → docs/art/levels-1-5-390x844.mp4
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';

const W = 390, H = 844, FPS = 30;
const OUT = process.argv[2] ?? 'docs/art/levels-1-5-390x844.mp4';
const frames = 'docs/art/.frames';
const PORT = Number(process.env.ART_PORT ?? 4186);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// deviceScaleFactor 2: a sharp video of a real 390x844 phone viewport
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://localhost:${PORT}/?capture=1&q=low&level=1&auto=1`);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
let f = 0;
const t0 = Date.now();
for (;;) {
  const st = await page.evaluate(() => { window.__game.step(1 / 30); return window.__game.state(); });
  await page.screenshot({ path: `${frames}/f${String(f++).padStart(5, '0')}.png` });
  if (f % 150 === 0) console.log(`frame ${f} level ${st.level} ${st.mode} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  // stop 2.5 s after the level-5 result card shows
  if (st.level === 5 && st.mode === 'won') {
    if (!globalThis.endAt) globalThis.endAt = f + Math.round(4.5 * FPS);
    if (f >= globalThis.endAt) break;
  }
  if (f > FPS * 150) break;
}
await browser.close();
server.kill();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/f%05d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', OUT]);
rmSync(frames, { recursive: true, force: true });
console.log(OUT, f, 'frames');

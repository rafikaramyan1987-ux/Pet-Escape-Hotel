// Trailer from real gameplay (the solver bot plays, frame-stepped so nothing is dropped).
//   node scripts/trailer.mjs landscape   → submission/trailer-1920x1080.mp4
//   node scripts/trailer.mjs portrait    → submission/trailer-1080x1620.mp4
// Captured at 2/3 size and upscaled with lanczos (SwiftShader is slow); max 20 s.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';

const kind = process.argv[2] ?? 'landscape';
const [W, H] = kind === 'portrait' ? [1080, 1620] : [1920, 1080];
const CW = Math.round((W * 2) / 3 / 2) * 2;
const CH = Math.round((H * 2) / 3 / 2) * 2;
const FPS = 30;
const OUT = `submission/trailer-${W}x${H}.mp4`;
const frames = `docs/art/.frames-${kind}`;
const PORT = Number(process.env.ART_PORT ?? 4190 + (kind === 'portrait' ? 1 : 0));
// [level, seconds to skip (not captured), seconds captured, bot delay]
const SEGMENTS = [
  [6, 0.6, 3.6, 0.42],
  [24, 1.0, 3.6, 0.36],
  [40, 4.0, 3.2, 0.36],
  [8, 2.2, 8.8, 0.4],
];
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: CW, height: CH }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://localhost:${PORT}/?capture=1&q=${process.env.Q ?? 'low'}&level=1`);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
let f = 0;
for (const [level, skip, secs, delay] of SEGMENTS) {
  await page.evaluate(([l, d]) => {
    window.__game.start(l, true);
    window.__game.game.botDelay = d;
    window.__game.game.botWait = 0.3;
    window.__game.game.autoAdvance = false;
  }, [level, delay]);
  if (skip > 0) await page.evaluate((n) => window.__game.step(1 / 30, n), Math.round(skip * FPS));
  const n = Math.round(secs * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.__game.step(1 / 30));
    await page.screenshot({ path: `${frames}/f${String(f++).padStart(5, '0')}.png` });
  }
  console.log(kind, 'level', level, 'frames', f, JSON.stringify(await page.evaluate(() => window.__game.state())));
}
await browser.close();
server.kill();
mkdirSync('submission', { recursive: true });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/f%05d.png`, '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', '-an', OUT]);
rmSync(frames, { recursive: true, force: true });
console.log(OUT, f, 'frames', (f / FPS).toFixed(1), 's');

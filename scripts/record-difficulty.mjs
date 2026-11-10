// Difficulty video (390x844 portrait): the solver bot clears levels 1, 3, 5, 9, 11, 15 (Hard) and 20 (Very hard),
// then a random-tapping bot fails a level. → docs/art/difficulty-v2-390x844.mp4
// Frame-stepped (nothing dropped); segments render in parallel (4 workers) and are joined.
//   node scripts/record-difficulty.mjs                  → everything
//   node scripts/record-difficulty.mjs seg <i> <out>    → one segment
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const W = 390, H = 844, FPS = 30;
const OUT = 'docs/art/difficulty-v2-390x844.mp4';
// [level, bot ('solver' | 'random'), caption]
const SEGMENTS = [
  [1, 'solver', 'Level 1 · tutorial · solver'],
  [3, 'solver', 'Level 3 · easy, with a trap · solver'],
  [5, 'solver', 'Level 5 · locked plank · solver'],
  [9, 'solver', 'Level 9 · ice · solver'],
  [11, 'solver', 'Level 11 · 4-slot tray · solver'],
  [15, 'solver', 'Level 15 · Hard level · solver'],
  [20, 'solver', 'Level 20 · Very hard, 3 slots · solver'],
  [12, 'random', 'Level 12 · random taps → tray full'],
];

if (process.argv[2] === 'seg') {
  const i = Number(process.argv[3]);
  const out = process.argv[4];
  const [level, bot, caption] = SEGMENTS[i];
  const { chromium } = await import('playwright');
  const frames = `docs/art/.frames-d${i}`;
  const PORT = 4210 + i;
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let k = 0; k < 60; k++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}/?capture=1&q=low&level=${level}&auto=${bot === 'random' ? 'random' : '1'}`);
  await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
  await page.evaluate(([cap, random]) => {
    const g = window.__game.game;
    g.botDelay = random ? 0.55 : 0.7;
    g.autoAdvance = false;
    const el = document.createElement('div');
    el.textContent = cap;
    el.style.cssText = `position:absolute;left:50%;bottom:118px;translate:-50% 0;z-index:40;padding:6px 14px;border-radius:999px;font:700 13px Fredoka,sans-serif;color:#fff;background:${random ? '#e0383e' : '#2f7a7c'};border:3px solid #3b2346;white-space:nowrap`;
    document.getElementById('app').appendChild(el);
  }, [caption, bot === 'random']);
  // the intro levels of a mechanic show its tip card for a moment, as a player sees it
  const tips = { 5: 'lock', 9: 'ice' };
  let f = 0;
  const shot = async () => page.screenshot({ path: `${frames}/f${String(f++).padStart(5, '0')}.png` });
  if (tips[level]) {
    await page.evaluate((m) => window.__game.game.hud.mechanicTip(m), tips[level]);
    for (let k = 0; k < 60; k++) {
      await page.evaluate(() => window.__game.step(1 / 30));
      await shot();
    }
    await page.evaluate(() => document.querySelector('[data-act=gotit]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  }
  let endAt = 0;
  for (;;) {
    const st = await page.evaluate(() => { window.__game.step(1 / 30); return window.__game.state(); });
    await shot();
    if (st.mode !== 'play' && !endAt) endAt = f + Math.round((st.mode === 'won' ? 4.6 : 3.2) * FPS);
    if ((endAt && f >= endAt) || f > FPS * 60) break;
  }
  await browser.close();
  server.kill();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/f%05d.png`, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', out]);
  rmSync(frames, { recursive: true, force: true });
  console.log(out, level, bot, f, 'frames');
} else {
  const parts = SEGMENTS.map((_, i) => `docs/art/.dseg-${i}.mp4`);
  const queue = SEGMENTS.map((_, i) => i);
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      await new Promise((res, rej) => {
        const p = spawn('node', ['scripts/record-difficulty.mjs', 'seg', String(i), parts[i]], { stdio: 'inherit' });
        p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`segment ${i} failed`))));
      });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  writeFileSync('docs/art/.dsegs.txt', parts.map((p) => `file '${p.replace('docs/art/', '')}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'docs/art/.dsegs.txt', '-c', 'copy', '-movflags', '+faststart', OUT]);
  for (const p of parts) rmSync(p, { force: true });
  rmSync('docs/art/.dsegs.txt', { force: true });
  console.log(OUT);
}

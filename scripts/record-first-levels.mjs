// First levels video (390x844 portrait): level 1 (tutorial), then levels 3, 5 and 8, where tapping the obvious
// screws loses (a random-tapping bot fills the tray) and the solver bot plans its way through.
// → docs/art/first-levels-v3-390x844.mp4
// Frame-stepped (nothing dropped); segments render in parallel (4 workers) and are joined.
//   node scripts/record-first-levels.mjs                  → everything
//   node scripts/record-first-levels.mjs seg <i> <out>    → one segment
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const W = 390, H = 844, FPS = 30;
const OUT = 'docs/art/first-levels-v3-390x844.mp4';
// [level, bot ('solver' | 'random'), caption]
const SEGMENTS = [
  [1, 'solver', 'Level 1 · tutorial'],
  [3, 'random', 'Level 3 · tapping without a plan → tray full'],
  [3, 'solver', 'Level 3 · ladder planks · planned'],
  [5, 'random', 'Level 5 · tapping without a plan → tray full'],
  [5, 'solver', 'Level 5 · round sticks, a padlock · planned'],
  [8, 'random', 'Level 8 · tapping without a plan → tray full'],
  [8, 'solver', 'Level 8 · grid, metal strips · planned'],
];

if (process.argv[2] === 'seg') {
  const i = Number(process.argv[3]);
  const out = process.argv[4];
  const [level, bot, caption] = SEGMENTS[i];
  const { chromium } = await import('playwright');
  const frames = `docs/art/.frames-f${i}`;
  const PORT = 4230 + i;
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let k = 0; k < 60; k++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}/?capture=1&q=low&level=${level}&auto=${bot === 'random' ? 'random' : '1'}`);
  await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
  // headless software rendering stalls on the blurred dialog backdrop over the tutorial tip: hide the tip behind
  // dialogs in the recording (players see the tip blurred behind the card; nothing else changes)
  await page.addStyleTag({ content: '#ui:has(.overlay) .tutorial-text { display: none; }' });
  await page.evaluate(([cap, random]) => {
    const g = window.__game.game;
    g.botDelay = random ? 0.55 : 0.7;
    // the random bot's seed (a careless player who loses; the audit measures how often that happens: ≥ 60 %)
    g.seed = 42;
    g.autoAdvance = false;
    const el = document.createElement('div');
    el.textContent = cap;
    el.style.cssText = `position:absolute;left:50%;bottom:118px;translate:-50% 0;z-index:40;padding:6px 14px;border-radius:999px;font:700 13px Fredoka,sans-serif;color:#fff;background:${random ? '#e0383e' : '#2f7a7c'};border:3px solid #3b2346;white-space:nowrap`;
    document.getElementById('app').appendChild(el);
  }, [caption, bot === 'random']);
  // the intro levels of a mechanic show its tip card for a moment, as a player sees it
  const tips = bot === 'solver' ? { 5: 'lock' } : {};
  let f = 0;
  const shot = async () => page.screenshot({ path: `${frames}/f${String(f++).padStart(5, '0')}.png`, timeout: 180_000 });
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
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/f%05d.png`, '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', out]);
  rmSync(frames, { recursive: true, force: true });
  console.log(out, level, bot, f, 'frames');
} else {
  const parts = SEGMENTS.map((_, i) => `docs/art/.fseg-${i}.mp4`);
  const queue = SEGMENTS.map((_, i) => i);
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      await new Promise((res, rej) => {
        const p = spawn('node', ['scripts/record-first-levels.mjs', 'seg', String(i), parts[i]], { stdio: 'inherit' });
        p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`segment ${i} failed`))));
      });
    }
  };
  await Promise.all(Array.from({ length: Number(process.env.WORKERS ?? 4) }, worker));
  writeFileSync('docs/art/.fsegs.txt', parts.map((p) => `file '${p.replace('docs/art/', '')}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'docs/art/.fsegs.txt', '-c', 'copy', '-movflags', '+faststart', OUT]);
  for (const p of parts) rmSync(p, { force: true });
  rmSync('docs/art/.fsegs.txt', { force: true });
  console.log(OUT);
}

// Records levels 1-10 played by the solver bot on a 390x844 portrait viewport → docs/art/levels-1-10-390x844.mp4
// Frame-stepped (nothing dropped); three segments render in parallel and are joined.
//   node scripts/record.mjs                 → all segments + join
//   node scripts/record.mjs seg <from> <to> <out.mp4>
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const W = 390, H = 844, FPS = 30;
const OUT = 'docs/art/levels-1-10-390x844.mp4';

if (process.argv[2] === 'seg') {
  const [from, to, out] = [Number(process.argv[3]), Number(process.argv[4]), process.argv[5]];
  const { chromium } = await import('playwright');
  const frames = `docs/art/.frames-${from}`;
  const PORT = 4186 + from;
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // deviceScaleFactor 1.5: a sharp video of a real 390x844 phone viewport (585x1266 px)
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}/?capture=1&q=low&level=${from}&auto=1`);
  await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
  await page.evaluate(() => { window.__game.game.botDelay = 0.85; });
  let f = 0;
  let endAt = 0;
  let tipShown = false;
  const t0 = Date.now();
  for (;;) {
    const st = await page.evaluate(() => { window.__game.step(1 / 30); return window.__game.state(); });
    // level 8 introduces ice: show its one-screen tip for a moment, as a player sees it
    if (st.level === 8 && !tipShown) {
      tipShown = true;
      await page.evaluate(() => window.__game.game.hud.mechanicTip('ice'));
      for (let i = 0; i < 75; i++) {
        await page.evaluate(() => window.__game.step(1 / 30));
        await page.screenshot({ path: `${frames}/f${String(f++).padStart(5, '0')}.png` });
      }
      await page.evaluate(() => document.querySelector('[data-act=gotit]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
    await page.screenshot({ path: `${frames}/f${String(f++).padStart(5, '0')}.png` });
    if (f % 150 === 0) console.log(`seg ${from}: frame ${f} level ${st.level} ${st.mode} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (st.level === to && st.mode === 'won' && !endAt) endAt = f + Math.round((to === 10 ? 4.5 : 3.6) * FPS);
    if (endAt && f >= endAt) break;
    if (st.level > to || f > FPS * 200) break;
  }
  await browser.close();
  server.kill();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/f%05d.png`, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', out]);
  rmSync(frames, { recursive: true, force: true });
  console.log(out, f, 'frames');
} else {
  const segs = [[1, 4], [5, 7], [8, 10]];
  const parts = segs.map(([a]) => `docs/art/.seg-${a}.mp4`);
  await Promise.all(segs.map(([a, b], i) => new Promise((res, rej) => {
    const p = spawn('node', ['scripts/record.mjs', 'seg', String(a), String(b), parts[i]], { stdio: 'inherit' });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`segment ${a}-${b} failed`))));
  })));
  writeFileSync('docs/art/.segs.txt', parts.map((p) => `file '${p.replace('docs/art/', '')}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'docs/art/.segs.txt', '-c', 'copy', '-movflags', '+faststart', OUT]);
  for (const p of parts) rmSync(p, { force: true });
  rmSync('docs/art/.segs.txt', { force: true });
  console.log(OUT);
}

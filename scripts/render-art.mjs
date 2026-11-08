// Renders the art-direction deliverables from the real 3D scene into docs/art/.
// Usage: npm run build && node scripts/render-art.mjs [still|video|all] [--only=name]
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const mode = process.argv[2] ?? 'all';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const OUT = 'docs/art';
const PORT = Number(process.env.ART_PORT ?? 4179);
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${PORT}/`;
for (let i = 0; i < 60; i++) {
  try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(w, h, query) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text()); });
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.__art?.ready, null, { timeout: 300_000 });
  return page;
}

const stills = [
  ['gameplay-portrait-1080x1920', 1080, 1920, 'shot=gameplay&t=1.2'],
  ['gameplay-landscape-1920x1080', 1920, 1080, 'shot=gameplay&t=1.2'],
  ['characters-lineup-1920x1080', 1920, 1080, 'shot=lineup&t=0.8'],
  ['title-cover-1920x1080', 1920, 1080, 'shot=title&t=1.0'],
];

if (mode === 'still' || mode === 'all') {
  for (const [name, w, h, q] of stills) {
    if (only && !name.startsWith(only)) continue;
    const t0 = Date.now();
    const page = await open(w, h, q);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`${name}.png  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await page.close();
  }
}

if (mode === 'video' || mode === 'all') {
  const W = 1920, H = 1080, FPS = 30, SECONDS = 10;
  const frames = 'docs/art/.frames';
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const page = await open(W, H, 'shot=turntable&t=0');
  const t0 = Date.now();
  for (let f = 0; f < FPS * SECONDS; f++) {
    await page.evaluate((t) => window.__art.renderAt(t), f / FPS);
    await page.screenshot({ path: `${frames}/f${String(f).padStart(4, '0')}.png` });
    if (f % 30 === 0) console.log(`frame ${f}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await page.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/f%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', `${OUT}/lobby-turntable-10s.mp4`]);
  rmSync(frames, { recursive: true, force: true });
  console.log('lobby-turntable-10s.mp4');
}

await browser.close();
server.kill();
if (!existsSync(OUT)) process.exit(1);

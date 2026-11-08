// Builds the CrazyGames submission folder: zip (index.html inside pet-escape-hotel-v1/), covers and trailers.
// Usage: node scripts/submission.mjs [zip|covers|trailers|all]
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';

const what = process.argv[2] ?? 'all';
const OUT = 'submission';
mkdirSync(`${OUT}/covers`, { recursive: true });
mkdirSync(`${OUT}/trailers`, { recursive: true });

if (what === 'zip' || what === 'all') {
  execFileSync('npx', ['vite', 'build', '--mode', 'crazygames'], { stdio: 'inherit' });
  rmSync('build-zip', { recursive: true, force: true });
  mkdirSync('build-zip/pet-escape-hotel-v1', { recursive: true });
  cpSync('dist-crazygames/index.html', 'build-zip/pet-escape-hotel-v1/index.html');
  rmSync(`${OUT}/pet-escape-hotel-v1.zip`, { force: true });
  execFileSync('zip', ['-r', '-X', `../${OUT}/pet-escape-hotel-v1.zip`, 'pet-escape-hotel-v1'], { cwd: 'build-zip', stdio: 'inherit' });
  rmSync('build-zip', { recursive: true, force: true });
}

if (what === 'covers' || what === 'trailers' || what === 'all') {
  execFileSync('npx', ['vite', 'build'], { stdio: 'inherit' });
  const PORT = 4190;
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const base = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  if (what === 'covers' || what === 'all') {
    for (const [name, w, h] of [['landscape-1920x1080', 1920, 1080], ['portrait-800x1200', 800, 1200], ['square-800x800', 800, 800]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.goto(`${base}?shot=title&t=1.0`);
      await page.waitForFunction(() => window.__art?.ready, null, { timeout: 300000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/covers/${name}.png` });
      await page.close();
      console.log(`cover ${name}`);
    }
  }

  if (what === 'trailers' || what === 'all') {
    // ~18 s of real gameplay: the playtest bot plays four rooms (HUD on), then the title card
    const segments = [['1-8', 5.0, 6], ['2-4', 4.0, 8], ['4-3', 4.0, 5], ['5-4', 3.0, 4]];
    for (const [name, w, h] of [['landscape-1920x1080', 1920, 1080], ['portrait-1080x1620', 1080, 1620]]) {
      const frames = `${OUT}/trailers/.frames-${name}`;
      rmSync(frames, { recursive: true, force: true });
      mkdirSync(frames, { recursive: true });
      // software rendering is slow: capture at 2/3 size, then upscale (lanczos) to the delivery size
      const cw = Math.round((w * 2) / 3);
      const ch = Math.round((h * 2) / 3);
      const page = await browser.newPage({ viewport: { width: cw, height: ch }, deviceScaleFactor: 1 });
      await page.goto(`${base}?capture=1&q=low&room=1-1`);
      await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
      let f = 0;
      for (const [room, secs, skip] of segments) {
        await page.evaluate(([id, s]) => { window.__game.start(id, true); window.__game.step(1 / 30, Math.round(s * 30)); }, [room, skip]);
        for (let i = 0; i < Math.round(secs * 30); i++) {
          await page.evaluate(() => window.__game.step(1 / 30));
          await page.screenshot({ path: `${frames}/f${String(f++).padStart(4, '0')}.png` });
        }
        console.log(`${name}: ${room} done (${f} frames)`);
      }
      await page.close();
      // closing title card
      const card = await browser.newPage({ viewport: { width: cw, height: ch }, deviceScaleFactor: 1 });
      await card.goto(`${base}?shot=title&t=0`);
      await card.waitForFunction(() => window.__art?.ready, null, { timeout: 300000 });
      for (let i = 0; i < 60; i++) {
        await card.evaluate((t) => window.__art.renderAt(t), i / 30);
        await card.screenshot({ path: `${frames}/f${String(f++).padStart(4, '0')}.png` });
      }
      await card.close();
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${frames}/f%04d.png`, '-vf', `scale=${w}:${h}:flags=lanczos,unsharp=5:5:0.6,fade=t=in:st=0:d=0.4,fade=t=out:st=17.6:d=0.4`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', `${OUT}/trailers/${name}.mp4`]);
      rmSync(frames, { recursive: true, force: true });
      console.log(`trailer ${name}`);
    }
  }
  await browser.close();
  server.kill();
}

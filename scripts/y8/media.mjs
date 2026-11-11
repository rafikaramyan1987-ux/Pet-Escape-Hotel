// Y8 media, all into submission-y8/media/, from the real game (the web build: same game, no SDK, with test hooks):
//  - screenshot-760x570-{1..4}.jpg (Standard Screenshots) and screenshot-1280x720-{1..4}.jpg (Widescreen Screenshots):
//    the four gameplay moments of scripts/web/game.mjs (level 1 with the tutorial hand, level 15 mid-level, level 12
//    ice + lock, a rescued pet), each rendered natively at both sizes
//  - promo-landscape-1920x1080.jpg (Landscape Promo): the approved cover, submission/cover-1920x1080.png
//  - promo-portrait-1080x1920.jpg (Portrait Promo) and promo-card-760x570.jpg (Game Card Promo): the same cover scene +
//    logo (`?cover=portrait|landscape`, as scripts/shoot.mjs) rendered natively at those sizes
//  - gameplay-1280x720.mp4 and gameplay-960x720.mp4: ONE continuous take of real play by the built-in solver bot
//    (levels 9 → 10: the first pet rescued at ~12 s, the second at ~27 s), every frame rendered (frame-stepped, nothing
//    dropped), no edits, no intro, no sound; the 960x720 version is the same take rendered at 960x720
//   npm run build && node scripts/y8/media.mjs [--only shots,promos,video]
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';
import web from '../web/game.mjs';
import { jpegInfo, videoInfo } from '../media-info.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : ['shots', 'promos', 'video'];
const OUT = 'submission-y8/media';
const MB = 1024 * 1024;
const PORT = Number(process.env.ART_PORT ?? 4185);
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${PORT}/`;
for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const jpg = (png, out, w, h) => {
  execFileSync('convert', [png, '-strip', '-sampling-factor', '4:2:0', '-quality', '90', '-interlace', 'JPEG', out]);
  rmSync(png, { force: true });
  const i = jpegInfo(out);
  if (i.w !== w || i.h !== h || i.bytes >= 2 * MB) throw new Error(`${out}: ${i.w}x${i.h}, ${i.bytes} bytes`);
  console.log(`${out} (${(i.bytes / 1024).toFixed(0)} KB)`);
};

try {
  if (only.includes('shots')) {
    for (const [w, h] of [[760, 570], [1280, 720]]) {
      for (const [k, shot] of web.shots.entries()) {
        const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => console.error('pageerror', e.message));
        if (shot.save) await page.addInitScript(shot.save);
        await page.goto(`${base}${shot.query ?? ''}`);
        await web.ready(page.mainFrame(), page);
        await shot.run(page.mainFrame(), page);
        await page.waitForTimeout(300);
        const png = `${OUT}/.tmp.png`;
        await page.screenshot({ path: png });
        await page.close();
        jpg(png, `${OUT}/screenshot-${w}x${h}-${k + 1}.jpg`, w, h);
        console.log(`  ${shot.name}`);
      }
    }
  }

  if (only.includes('promos')) {
    const png = `${OUT}/.tmp.png`;
    execFileSync('convert', ['submission/cover-1920x1080.png', png]);
    jpg(png, `${OUT}/promo-landscape-1920x1080.jpg`, 1920, 1080);
    for (const [w, h, cover, file] of [[1080, 1920, 'portrait', 'promo-portrait-1080x1920.jpg'], [760, 570, 'square', 'promo-card-760x570.jpg']]) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => console.error('pageerror', e.message));
      await page.goto(`${base}?capture=1&q=high&level=4&auto=1&cover=${cover}`);
      await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
      await page.evaluate(() => window.__game.step(1 / 30, 78));
      // the logo takes the top: the toolboxes stay out of the shot (as the game's own portrait / square covers do)
      await page.evaluate(() => {
        for (const b of window.__game.game.view.boxes) b.g.visible = false;
        window.__game.step(1 / 30);
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: png });
      await page.close();
      jpg(png, `${OUT}/${file}`, w, h);
    }
  }

  if (only.includes('video')) {
    const FPS = 30;
    const SECONDS = 29;
    for (const [w, h] of [[1280, 720], [960, 720]]) {
      const dir = `${OUT}/.frames-${w}x${h}`;
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => console.error('pageerror', e.message));
      await page.goto(`${base}?capture=1&q=high&level=9&auto=1`);
      await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
      await page.evaluate(() => { window.__game.game.botDelay = 0.7; });
      // CSS animations (result card stars, toasts) follow the game clock
      const css = (ms) => page.evaluate((ms) => {
        for (const a of document.getAnimations()) {
          if (a.playState !== 'paused') a.pause();
          a.currentTime = (Number(a.currentTime) || 0) + ms;
        }
      }, ms);
      for (let f = 0; f < SECONDS * FPS; f++) {
        const st = await page.evaluate(() => { window.__game.step(1 / 30); return window.__game.state(); });
        await css(1000 / FPS);
        await page.screenshot({ path: `${dir}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94 });
        if (f % 150 === 0) console.log(`  ${w}x${h} ${(f / FPS).toFixed(0)}s level ${st.level} ${st.mode}`);
      }
      await page.close();
      const out = `${OUT}/gameplay-${w}x${h}.mp4`;
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/f%05d.jpg`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
      rmSync(dir, { recursive: true, force: true });
      const v = videoInfo(out);
      if (v.w !== w || v.h !== h || v.seconds < 20 || v.seconds > 30 || v.bytes >= 50 * MB) throw new Error(`${out}: ${JSON.stringify(v)}`);
      console.log(`${out} (${(v.bytes / MB).toFixed(1)} MB, ${v.seconds.toFixed(1)} s)`);
    }
  }
} finally {
  await browser.close();
  server.kill();
}

// Screenshot menus: node scripts/shoot-ui.mjs <w> <h> <out> <script: home|shop|floors|daily|won|caught>
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const [w = '1080', h = '1920', out = 'ui.png', what = 'home'] = process.argv.slice(2);
const PORT = Number(process.env.ART_PORT ?? 4182);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://localhost:${PORT}/?capture=1&q=${process.env.Q ?? 'high'}`);
await page.waitForFunction(() => window.__game);
await page.evaluate((what) => {
  const g = window.__game.game;
  g.save.coins = 640;
  g.save.rooms['1-1'] = { stars: 3, bones: 3, best: 20 }; g.save.rooms['1-2'] = { stars: 2, bones: 3, best: 20 }; g.save.rooms['1-3'] = { stars: 3, bones: 3, best: 20 };
  g.save.owned.push('hat:party', 'collar:bow');
  g.save.looks.dog.hat = 'party'; g.save.looks.dog.collar = 'bow';
  if (what === 'home') g.ui.home();
  if (what === 'floors') g.ui.floors(1);
  if (what === 'shop') g.ui.shop('dog', 'hat', 'crown');
  if (what === 'daily') { g.ui.home(); g.ui.daily(); }
  window.__game.step(1 / 30, 20);
}, what);
await page.waitForTimeout(600);
await page.screenshot({ path: out });
await browser.close();
server.kill();

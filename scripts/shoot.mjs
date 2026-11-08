// Screenshot real gameplay: node scripts/shoot.mjs <room> <seconds> <w> <h> <out.png> [map]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const [room = '1-8', secs = '6', w = '1080', h = '1920', out = 'shot.png', extra = ''] = process.argv.slice(2);
const PORT = Number(process.env.ART_PORT ?? 4181);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${PORT}/`;
for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto(`${base}?capture=1&q=${process.env.Q ?? 'high'}&room=${room}&auto=1`);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
const frames = Math.round(Number(secs) * 30);
await page.evaluate(([n, map]) => { if (map === 'map') window.__game.game.camMode = 'map'; window.__game.step(1 / 30, n); }, [frames, extra]);
if (extra === 'map') await page.evaluate(() => { window.__game.game.mode = 'intro'; window.__game.game.introLeft = 99; window.__game.step(1 / 30, 60); });
await page.waitForTimeout(200);
await page.screenshot({ path: out });
console.log(out, JSON.stringify(await page.evaluate(() => window.__game.state())));
await browser.close();
server.kill();

// GameMonetize upload: zips dist-gamemonetize/index.html (run `npm run build:gamemonetize` first) with index.html at the
// zip root (GameMonetize: "Root folder of .ZIP file must include index.html and game files"), then runs the checks.
// Usage: node scripts/gamemonetize/zip.mjs [out.zip] [--no-images]  (default submission-gamemonetize/screw-and-rescue-gamemonetize-v1.zip)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] ?? 'submission-gamemonetize/screw-and-rescue-gamemonetize-v1.zip';
if (!existsSync('dist-gamemonetize/index.html')) throw new Error('dist-gamemonetize/index.html missing: run `npm run build:gamemonetize` first');
mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-j', '-9', '-X', '-q', out, 'dist-gamemonetize/index.html'], { stdio: 'inherit' });
console.log(`${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
execFileSync('node', ['scripts/gamemonetize/check.mjs', out, ...process.argv.slice(3)], { stdio: 'inherit' });

// Y8 upload: zips dist-y8/index.html (run `npm run build:y8` first) with index.html at the
// zip root, then runs the checks.
// Usage: node scripts/y8/zip.mjs [out.zip] [--no-media]   (default submission-y8/screw-and-rescue-y8-v1.zip)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] ?? 'submission-y8/screw-and-rescue-y8-v1.zip';
if (!existsSync('dist-y8/index.html')) throw new Error('dist-y8/index.html missing: run `npm run build:y8` first');
mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-j', '-9', '-X', '-q', out, 'dist-y8/index.html'], { stdio: 'inherit' });
console.log(`${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
execFileSync('node', ['scripts/y8/check.mjs', out, ...process.argv.slice(3)], { stdio: 'inherit' });

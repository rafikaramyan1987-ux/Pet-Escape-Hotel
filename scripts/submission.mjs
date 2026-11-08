// Submission folder: node scripts/submission.mjs zip  → submission/screw-and-rescue-v1.zip
// (index.html inside the folder screw-and-rescue-v1/; covers and trailers come in phase B)
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const what = process.argv[2] ?? 'zip';
if (what === 'zip') {
  execFileSync('npx', ['vite', 'build', '--mode', 'crazygames'], { stdio: 'inherit' });
  rmSync('build-zip', { recursive: true, force: true });
  mkdirSync('build-zip/screw-and-rescue-v1', { recursive: true });
  mkdirSync('submission', { recursive: true });
  cpSync('dist-crazygames/index.html', 'build-zip/screw-and-rescue-v1/index.html');
  rmSync('submission/screw-and-rescue-v1.zip', { force: true });
  execFileSync('zip', ['-r', '-X', '../submission/screw-and-rescue-v1.zip', 'screw-and-rescue-v1'], { cwd: 'build-zip', stdio: 'inherit' });
  rmSync('build-zip', { recursive: true, force: true });
}

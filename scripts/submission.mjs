// Submission folder (CrazyGames):
//   node scripts/submission.mjs zip      → submission/screw-and-rescue-v1.zip (folder screw-and-rescue-v1/ with index.html)
//   node scripts/submission.mjs covers   → submission/cover-1920x1080.png, cover-800x1200.png, cover-800x800.png
//   trailers: node scripts/trailer.mjs landscape|portrait (needs `npm run build` first, like covers)
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';

const what = process.argv[2] ?? 'zip';
mkdirSync('submission', { recursive: true });
if (what === 'zip') {
  execFileSync('npx', ['vite', 'build', '--mode', 'crazygames'], { stdio: 'inherit' });
  rmSync('build-zip', { recursive: true, force: true });
  mkdirSync('build-zip/screw-and-rescue-v1', { recursive: true });
  cpSync('dist-crazygames/index.html', 'build-zip/screw-and-rescue-v1/index.html');
  rmSync('submission/screw-and-rescue-v1.zip', { force: true });
  execFileSync('zip', ['-r', '-X', '../submission/screw-and-rescue-v1.zip', 'screw-and-rescue-v1'], { cwd: 'build-zip', stdio: 'inherit' });
  rmSync('build-zip', { recursive: true, force: true });
}
if (what === 'covers') {
  // landscape: the approved title cover; portrait and square are rendered from the same scene (level 1 crate + logo)
  copyFileSync('docs/art/title-cover-1920x1080.png', 'submission/cover-1920x1080.png');
  const shoot = (w, h, cover) => execFileSync('node', ['scripts/shoot.mjs', '1', '0.6', String(w), String(h), `submission/cover-${w}x${h}.png`, cover, '0'], { stdio: 'inherit' });
  shoot(800, 1200, 'portrait');
  shoot(800, 800, 'square');
}

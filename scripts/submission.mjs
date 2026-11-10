// Submission packages, built from the current code:
//   node scripts/submission.mjs zip       → submission/screw-and-rescue-v2.zip (CrazyGames: folder screw-and-rescue-v2/ with index.html;
//                                           v1.zip stays as it was submitted)
//   node scripts/submission.mjs covers    → submission/cover-1920x1080|800x1200|800x800.png (after npm run build)
//   node scripts/submission.mjs gd        → submission-gd/screw-and-rescue-gd-v1.zip (index.html at the zip root) and the JPG
//                                           thumbnails 512x384, 512x512, 200x120, 1280x720, 1280x550 (from the covers)
//   node scripts/submission.mjs gamepix   → submission-gamepix/screw-and-rescue-gamepix-v1.zip (index.html at the zip root),
//                                           icon-256x256.jpg and cover-1360x850.jpg (from the covers)
//   trailers: node scripts/trailer.mjs landscape|portrait (needs `npm run build` first, like covers)
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';

const what = process.argv[2] ?? 'zip';
const build = (mode) => execFileSync('npx', ['vite', 'build', '--mode', mode], { stdio: 'inherit' });
/** Scale a cover to fill w×h (cropping the overflow around `anchor`: x,y in 0..1) and save it as a JPG. */
const thumb = (src, w, h, dst, anchor = [0.5, 0.5]) =>
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-vf',
    `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}:(iw-${w})*${anchor[0]}:(ih-${h})*${anchor[1]}`,
    '-q:v', '2', '-frames:v', '1', dst], { stdio: 'inherit' });
/** index.html alone at the root of the zip. */
const rootZip = (dir, zip) => {
  rmSync(zip, { force: true });
  execFileSync('zip', ['-j', '-9', '-X', '-q', zip, `${dir}/index.html`], { stdio: 'inherit' });
  execFileSync('node', ['scripts/check-zips.mjs', zip], { stdio: 'inherit' });
};

const LANDSCAPE = 'submission/cover-1920x1080.png';
const SQUARE = 'submission/cover-800x800.png';

if (what === 'zip') {
  mkdirSync('submission', { recursive: true });
  build('crazygames');
  rmSync('build-zip', { recursive: true, force: true });
  mkdirSync('build-zip/screw-and-rescue-v2', { recursive: true });
  cpSync('dist-crazygames/index.html', 'build-zip/screw-and-rescue-v2/index.html');
  rmSync('submission/screw-and-rescue-v2.zip', { force: true });
  execFileSync('zip', ['-r', '-X', '-q', '../submission/screw-and-rescue-v2.zip', 'screw-and-rescue-v2'], { cwd: 'build-zip', stdio: 'inherit' });
  rmSync('build-zip', { recursive: true, force: true });
  execFileSync('node', ['scripts/check-zips.mjs', 'submission/screw-and-rescue-v2.zip'], { stdio: 'inherit' });
}
if (what === 'covers') {
  // landscape: the approved title cover; portrait and square are rendered from the same scene (level 4 cage + logo, like the approved one)
  copyFileSync('docs/art/title-cover-1920x1080.png', 'submission/cover-1920x1080.png');
  const shoot = (w, h, cover) => execFileSync('node', ['scripts/shoot.mjs', '4', '2.6', String(w), String(h), `submission/cover-${w}x${h}.png`, cover, '1'], { stdio: 'inherit' });
  shoot(800, 1200, 'portrait');
  shoot(800, 800, 'square');
}
if (what === 'gd') {
  const out = 'submission-gd';
  mkdirSync(out, { recursive: true });
  build('gd');
  rootZip('dist-gd', `${out}/screw-and-rescue-gd-v1.zip`);
  // the title "Screw & Rescue" is part of the cover art, top right: crops keep the right edge and the top in frame
  thumb(LANDSCAPE, 512, 384, `${out}/thumb-512x384.jpg`, [1, 0]);
  thumb(SQUARE, 512, 512, `${out}/thumb-512x512.jpg`);
  thumb(LANDSCAPE, 200, 120, `${out}/thumb-200x120.jpg`, [1, 0]);
  thumb(LANDSCAPE, 1280, 720, `${out}/thumb-1280x720.jpg`);
  thumb(LANDSCAPE, 1280, 550, `${out}/thumb-1280x550.jpg`, [0.5, 0]);
}
if (what === 'gamepix') {
  const out = 'submission-gamepix';
  mkdirSync(out, { recursive: true });
  build('gamepix');
  rootZip('dist-gamepix', `${out}/screw-and-rescue-gamepix-v1.zip`);
  thumb(SQUARE, 256, 256, `${out}/icon-256x256.jpg`);
  thumb(LANDSCAPE, 1360, 850, `${out}/cover-1360x850.jpg`, [1, 0]);
}

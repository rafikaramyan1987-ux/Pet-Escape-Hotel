// Y8 submission checks: node scripts/y8/check.mjs [zip] [--no-media]   (default zip: submission-y8/screw-and-rescue-y8-v2.zip)
// - index.html alone at the zip root (one self-contained file: relative paths only, no ./assets)
// - `<script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async>` in <head>, the only external URL; the SDK is
//   never bundled (nothing in the bundle dispatches y8sdk.ready or defines window.y8)
// - the app id and game id, the y8sdk.ready listener, init / onAuth / emitReadyEvent / showAd calls
// - no other ad network / portal SDK, no "More games", no window.open
// - submission-y8/media: every JPG at its exact size, both MP4s (H.264, 1280x720 and 960x720, 20-30 s, < 50 MB);
//   README.md
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { externalUrls, jpegInfo, OTHER_SDKS, videoInfo } from '../media-info.mjs';

const Y8_SDK = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';
const APP_ID = '6af4b159ca1c6869a74e059b';
const GAME_ID = '292545';
const DIR = 'submission-y8';
const MB = 1024 * 1024;
const args = process.argv.slice(2);
const zip = args.find((a) => !a.startsWith('--')) ?? `${DIR}/screw-and-rescue-y8-v2.zip`;
const errors = [];

const files = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter((f) => f && !f.endsWith('/'));
if (files.join() !== 'index.html') errors.push(`zip must hold index.html alone at its root, has: ${files.join(', ')}`);
const html = files.includes('index.html') ? execFileSync('unzip', ['-p', zip, 'index.html'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) : '';
const lower = html.toLowerCase();
const head = html.slice(0, html.indexOf('</head>'));
if (/(src|href)="\//.test(html) || /(src|href)="\.\/assets/.test(html) || /rel="manifest"/.test(html)) errors.push('absolute paths, ./assets or a manifest (must be one self-contained file with relative paths)');
if (!head.includes(`<script src="${Y8_SDK}" async></script>`)) errors.push(`<script src="${Y8_SDK}" async> missing from <head>`);
if (html.split(Y8_SDK).length !== 2) errors.push(`${Y8_SDK} must be referenced exactly once`);
if (/Event\(\s*["'`]y8sdk\.ready/.test(html) || /window\.y8\s*=/.test(html)) errors.push('a copy of the Y8 SDK is bundled (must come from the CDN only)');
for (const s of [APP_ID, GAME_ID, 'y8sdk.ready', 'emitReadyEvent', '.onAuth(', '.showAd(', 'preloadAdBreaks', 'autoLogin']) if (!html.includes(s)) errors.push(`"${s}" missing`);
const urls = externalUrls(html).filter((u) => u !== Y8_SDK);
if (urls.length) errors.push(`external URLs besides the SDK: ${urls.join(', ')}`);
for (const [name, s] of Object.entries(OTHER_SDKS)) if (name !== 'y8' && lower.includes(s)) errors.push(`"${s}" (${name}) in the bundle`);
if (/more games/i.test(html)) errors.push('"More games" in the bundle');
if (/window\.open\(/.test(html)) errors.push('window.open (external link) in the bundle');

if (!args.includes('--no-media')) {
  const M = `${DIR}/media`;
  const images = [
    ...[1, 2, 3, 4].map((i) => [`screenshot-760x570-${i}.jpg`, 760, 570]),
    ...[1, 2, 3, 4].map((i) => [`screenshot-1280x720-${i}.jpg`, 1280, 720]),
    ['promo-landscape-1920x1080.jpg', 1920, 1080],
    ['promo-portrait-1080x1920.jpg', 1080, 1920],
    ['promo-card-760x570.jpg', 760, 570],
  ];
  for (const [f, w, h] of images) {
    const i = existsSync(`${M}/${f}`) ? jpegInfo(`${M}/${f}`) : null;
    if (!i) errors.push(`${M}/${f}: missing or not a JPEG`);
    else if (i.w !== w || i.h !== h || i.bytes >= 2 * MB) errors.push(`${M}/${f}: ${i.w}x${i.h}, ${i.bytes} bytes (needs ${w}x${h}, < 2 MB)`);
  }
  for (const [w, h] of [[1280, 720], [960, 720]]) {
    const f = `${M}/gameplay-${w}x${h}.mp4`;
    if (!existsSync(f)) {
      errors.push(`${f} missing`);
      continue;
    }
    const v = videoInfo(f);
    if (v.w !== w || v.h !== h || v.codec !== 'h264' || v.seconds < 20 || v.seconds > 30 || v.bytes >= 50 * MB) errors.push(`${f}: ${v.w}x${v.h} ${v.codec}, ${v.seconds.toFixed(1)} s, ${v.bytes} bytes (needs ${w}x${h} H.264, 20-30 s, < 50 MB)`);
  }
  if (!existsSync(`${DIR}/README.md`)) errors.push(`${DIR}/README.md missing`);
}

if (errors.length) {
  console.error(`${zip} FAILED:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`${zip} ok: index.html (${(html.length / 1024).toFixed(0)} KB), Y8 SDK from the CDN (async, <head>), app ${APP_ID} / game ${GAME_ID}, no other SDK${args.includes('--no-media') ? '' : '; 11 JPGs and 2 MP4s at their sizes'}`);

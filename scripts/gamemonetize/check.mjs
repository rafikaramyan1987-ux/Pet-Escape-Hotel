// GameMonetize submission checks: node scripts/gamemonetize/check.mjs [zip] [--no-images]
// (default zip: submission-gamemonetize/screw-and-rescue-gamemonetize-v1.zip)
// - index.html at the zip root and nothing else (one self-contained file: relative paths only, no ./assets)
// - window.SDK_OPTIONS with the game id, https://api.gamemonetize.com/sdk.js the only external URL, never a copy of the SDK
// - no other ad network / portal SDK, no "More games", no window.open
// - submission-gamemonetize/: the three JPG thumbnails at 512x384, 512x512, 512x340, each under 300 KB, and README.md
//   with Description <= 600 and Controls <= 350 characters
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { externalUrls, jpegInfo, OTHER_SDKS } from '../media-info.mjs';

const GM_SDK = 'https://api.gamemonetize.com/sdk.js';
const GM_ID = 'qd017r024ijevcoihn7kl2hkyvkw2t7z';
const DIR = 'submission-gamemonetize';
const args = process.argv.slice(2);
const zip = args.find((a) => !a.startsWith('--')) ?? `${DIR}/screw-and-rescue-gamemonetize-v1.zip`;
const errors = [];

const files = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter((f) => f && !f.endsWith('/'));
if (files.join() !== 'index.html') errors.push(`zip must hold index.html alone at its root, has: ${files.join(', ')}`);
const html = files.includes('index.html') ? execFileSync('unzip', ['-p', zip, 'index.html'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) : '';
const lower = html.toLowerCase();
if (/(src|href)="\//.test(html) || /(src|href)="\.\/assets/.test(html) || /rel="manifest"/.test(html)) errors.push('absolute paths, ./assets or a manifest (must be one self-contained file with relative paths)');
if (!html.includes('SDK_OPTIONS')) errors.push('window.SDK_OPTIONS missing');
if (!html.includes(GM_ID)) errors.push(`game id ${GM_ID} missing`);
if (!html.includes(GM_SDK)) errors.push(`${GM_SDK} missing`);
if (!html.includes('gamemonetize-sdk')) errors.push('script id "gamemonetize-sdk" missing');
if (/<script[^>]*src="https:\/\/api\.gamemonetize\.com/.test(html)) errors.push('sdk.js must be injected once by the game at boot, not as a static tag');
const urls = externalUrls(html).filter((u) => u !== GM_SDK);
if (urls.length) errors.push(`external URLs besides the SDK: ${urls.join(', ')}`);
for (const [name, s] of Object.entries(OTHER_SDKS)) if (name !== 'gamemonetize' && lower.includes(s)) errors.push(`"${s}" (${name}) in the bundle`);
if (/more games/i.test(html)) errors.push('"More games" in the bundle');
if (/window\.open\(/.test(html)) errors.push('window.open (external link) in the bundle');

if (!args.includes('--no-images')) {
  for (const [w, h] of [[512, 384], [512, 512], [512, 340]]) {
    const f = `${DIR}/screw-and-rescue-${w}x${h}.jpg`;
    const i = existsSync(f) ? jpegInfo(f) : null;
    if (!i) errors.push(`${f}: missing or not a JPEG`);
    else if (i.w !== w || i.h !== h || i.bytes >= 300 * 1024) errors.push(`${f}: ${i.w}x${i.h}, ${i.bytes} bytes (needs ${w}x${h}, < 300 KB)`);
  }
  const readme = existsSync(`${DIR}/README.md`) ? readFileSync(`${DIR}/README.md`, 'utf8') : '';
  if (!readme) errors.push(`${DIR}/README.md missing`);
  // the text inside the ```text fence right under a "## <name>" heading
  const field = (name) => readme.match(new RegExp(`## ${name}[^\\n]*\\n+\`\`\`text\\n([\\s\\S]*?)\\n\`\`\``))?.[1];
  for (const [name, max] of [['Description', 600], ['Controls', 350]]) {
    const v = field(name);
    if (v === undefined) errors.push(`README: no "## ${name}" text block`);
    else if ([...v].length > max) errors.push(`README: ${name} is ${[...v].length} characters (max ${max})`);
    else {
      const stated = readme.match(new RegExp(`## ${name} \\((\\d+) characters`))?.[1];
      if (Number(stated) !== [...v].length) errors.push(`README: ${name} says ${stated} characters, is ${[...v].length}`);
    }
  }
}

if (errors.length) {
  console.error(`${zip} FAILED:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`${zip} ok: index.html (${(html.length / 1024).toFixed(0)} KB), SDK_OPTIONS + ${GM_SDK}, no other SDK${args.includes('--no-images') ? '' : '; thumbnails 512x384 / 512x512 / 512x340 < 300 KB; README limits'}`);

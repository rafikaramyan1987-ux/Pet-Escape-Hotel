// CI check of the portal zips: node scripts/check-zips.mjs [zip …] (default: the committed GD, GamePix and CrazyGames v2 zips)
// - GameDistribution / GamePix: index.html alone at the zip root; CrazyGames: screw-and-rescue-vN/index.html
// - the right SDK referenced, and no other portal's SDK strings anywhere in the bundle
// - one self-contained file (no ./assets, no manifest); GamePix: no external URL but its SDK, the SDK script
//   (manual lifecycle) before the game bundle, saves through known localStorage keys only
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const GD = { sdk: 'https://html5.api.gamedistribution.com/main.min.js', id: 'b25c8dbf41c5409aa7a8fabe7fc7d2e3' };
const GPX = 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js';
const CG = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const NAMESPACES = new Set(['http://www.w3.org/1999/xhtml', 'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink']);
const zips = process.argv.slice(2);
if (!zips.length) zips.push('submission-gd/screw-and-rescue-gd-v1.zip', 'submission-gamepix/screw-and-rescue-gamepix-v1.zip', 'submission/screw-and-rescue-v2.zip');

let failed = 0;
for (const zip of zips) {
  const errors = [];
  const files = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter((f) => f && !f.endsWith('/'));
  const kind = /gamepix/.test(basename(zip)) ? 'gamepix' : /-gd-/.test(basename(zip)) ? 'gd' : 'crazygames';
  const entry = kind === 'crazygames' ? files.find((f) => /^screw-and-rescue-v\d+\/index\.html$/.test(f)) : 'index.html';
  if (kind === 'crazygames' ? files.length !== 1 || !entry : files.join() !== 'index.html') errors.push(`unexpected files: ${files.join(', ')} (${kind === 'crazygames' ? 'screw-and-rescue-vN/index.html' : 'index.html at the root'} only)`);
  const html = entry ? execFileSync('unzip', ['-p', zip, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) : '';
  const lower = html.toLowerCase();
  if (/src="\.\/assets|rel="manifest"/.test(html)) errors.push('not self-contained (./assets or a manifest)');
  const forbid = { gd: ['crazygames', 'gamepix'], gamepix: ['crazygames', 'gamedistribution', 'gdsdk'], crazygames: ['gamedistribution', 'gamepix', 'gdsdk'] }[kind];
  for (const bad of forbid) if (lower.includes(bad)) errors.push(`"${bad}" found in the bundle`);
  if (kind === 'gd') {
    if (!html.includes(GD.sdk)) errors.push('GD SDK URL missing');
    if (!html.includes(GD.id)) errors.push('GD game id missing');
    if (!html.includes('gamedistribution-jssdk')) errors.push('script id "gamedistribution-jssdk" missing');
    if (!html.includes('GD_OPTIONS')) errors.push('GD_OPTIONS missing');
  }
  if (kind === 'gamepix') {
    const sdkTag = html.indexOf(`<script src="${GPX}"></script>`);
    const cfg = html.search(/<script>window\.GamePixConfig = \{ lifecycle: 'manual' \};<\/script>/);
    const bundle = html.indexOf('<script type="module"');
    if (sdkTag < 0) errors.push('gamepix.sdk.js is not referenced as an external <script src>');
    if (cfg < 0) errors.push("GamePixConfig { lifecycle: 'manual' } missing");
    if (cfg > sdkTag || bundle < 0 || sdkTag > bundle) errors.push('GamePixConfig, then the SDK, must come before the game bundle');
    const urls = [...new Set(html.match(/https?:\/\/[^\s"'`<>)\\]+/gi) ?? [])];
    const links = urls.filter((u) => u !== GPX && !NAMESPACES.has(u));
    if (links.length) errors.push(`external URLs in the bundle: ${links.join(', ')}`);
    if (/localStorage\.(length|key\()/.test(html)) errors.push('localStorage.length / key(i) used (known keys only)');
  }
  if (kind === 'crazygames' && !html.includes(`<script src="${CG}"></script>`)) errors.push('CrazyGames SDK script missing');
  if (errors.length) {
    failed++;
    console.error(`${zip} (${kind}) FAILED:\n- ${errors.join('\n- ')}`);
  } else console.log(`${zip} (${kind}) ok: ${files.join(', ')}, ${(html.length / 1024).toFixed(0)} KB`);
}
process.exit(failed ? 1 : 0);

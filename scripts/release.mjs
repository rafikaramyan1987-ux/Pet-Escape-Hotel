// Release: rebuild every platform build and its submission zip from the current code, then run every submission check.
//   node scripts/release.mjs            (all)        node scripts/release.mjs gd playgama   (some)
// The zip names (one version per portal, older zips stay as they were submitted) are RELEASE below; the scripts'
// defaults (scripts/submission.mjs, scripts/*/zip.mjs, check.mjs, game.mjs) and CI point at the same files.
// Same IDs as before: GD b25c8dbf…, GameMonetize qd017r02…, Y8 game 292545 / app 6af4b159… (in src/platform/*).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

export const RELEASE = {
  web: 'submission-web/screw-and-rescue-web-v2.zip',
  crazygames: 'submission/screw-and-rescue-v3.zip',
  gd: 'submission-gd/screw-and-rescue-gd-v2.zip',
  gamepix: 'submission-gamepix/screw-and-rescue-gamepix-v3.zip',
  playgama: 'submission-playgama/screw-and-rescue-playgama-v3.zip',
  gamemonetize: 'submission-gamemonetize/screw-and-rescue-gamemonetize-v2.zip',
  y8: 'submission-y8/screw-and-rescue-y8-v2.zip',
};

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const build = (mode) => run('npx', ['vite', 'build', '--mode', mode]);
/** index.html alone at the root of the zip */
const rootZip = (dir, zip) => {
  rmSync(zip, { force: true });
  run('zip', ['-j', '-9', '-X', '-q', zip, `${dir}/index.html`]);
};

const STEPS = {
  web: () => {
    build('web');
    run('node', ['scripts/web/zip.mjs', RELEASE.web]);
    run('node', ['scripts/web/check.mjs', RELEASE.web, '--static']);
  },
  crazygames: () => {
    // CrazyGames: the folder screw-and-rescue-vN/ with index.html in it
    build('crazygames');
    const folder = RELEASE.crazygames.match(/(screw-and-rescue-v\d+)\.zip$/)[1];
    rmSync('build-zip', { recursive: true, force: true });
    mkdirSync(`build-zip/${folder}`, { recursive: true });
    cpSync('dist-crazygames/index.html', `build-zip/${folder}/index.html`);
    rmSync(RELEASE.crazygames, { force: true });
    execFileSync('zip', ['-r', '-X', '-q', `../${RELEASE.crazygames}`, folder], { cwd: 'build-zip', stdio: 'inherit' });
    rmSync('build-zip', { recursive: true, force: true });
    run('node', ['scripts/check-zips.mjs', RELEASE.crazygames]);
  },
  gd: () => {
    build('gd');
    rootZip('dist-gd', RELEASE.gd);
    run('node', ['scripts/check-zips.mjs', RELEASE.gd]);
  },
  gamepix: () => {
    build('gamepix');
    rootZip('dist-gamepix', RELEASE.gamepix);
    run('node', ['scripts/check-zips.mjs', RELEASE.gamepix]);
  },
  playgama: () => {
    build('playgama');
    run('node', ['scripts/playgama/zip.mjs', RELEASE.playgama]);
    run('node', ['scripts/playgama/check.mjs', RELEASE.playgama]);
  },
  gamemonetize: () => {
    build('gamemonetize');
    run('node', ['scripts/gamemonetize/zip.mjs', RELEASE.gamemonetize]);
  },
  y8: () => {
    build('y8');
    run('node', ['scripts/y8/zip.mjs', RELEASE.y8]);
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const pick = process.argv.slice(2);
  for (const p of pick.length ? pick : Object.keys(STEPS)) {
    if (!STEPS[p]) throw new Error(`unknown platform ${p} (${Object.keys(STEPS).join(', ')})`);
    console.log(`\n── ${p} → ${RELEASE[p]}`);
    STEPS[p]();
  }
  // every submission folder (covers, trailers, thumbnails, READMEs) still passes
  run('python3', ['scripts/check-submission.py']);
}

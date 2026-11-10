// Game-specific settings for the open-portal web zip (scripts/web/zip.mjs) and its checker (scripts/web/check.mjs).
export default {
  slug: 'screw-and-rescue',
  /** the ad-free web build (src/platform/web.ts): no portal SDK, `adsEnabled === false`, so no rewarded-ad buttons */
  build: 'npm run build:web',
  dist: 'dist',
  /** .woff fallbacks of the bundled fonts: never fetched by browsers that run WebGL 2 (woff2 is there) */
  exclude: ['*.woff'],
  /** the only localStorage key the game writes (src/game/save.ts SAVE_KEY) */
  storageKeys: ['screw-and-rescue.save.v1'],
  /** a new player: the game opens level 1 (the tutorial level) */
  query: '?q=low',
  canvasSelector: 'canvas#view',
  /** the "watch an ad: +1 slot and continue" button on the fail card (the boosters show a coin price, never an ad badge) */
  adSelector: '[data-act=adcontinue], [data-testid=continue]',
  async ready(frame) {
    await frame.waitForFunction(() => window.__game?.state().mode === 'play', null, { timeout: 120_000 });
  },
  /** level 1: tap the solver's best next screw (the one the tutorial hand points at) until the pet is free, like
   * the e2e tests, then wait for the result card. The game's frame loop is handed to the test hook first (what
   * `?capture=1` does): game time is advanced in bulk without rendering, then one frame is rendered (software
   * WebGL renders the full post-processing stack at a few seconds per frame, so a free-running loop starves the
   * screenshots). */
  async play(frame) {
    const level = await frame.evaluate(() => window.__game.state().level);
    const s = await frame.evaluate(() => {
      const g = window.__game, x = g.game;
      x.opts.manual = true;
      const run = (n) => { for (let k = 0; k < n; k++) x.advance(1 / 30, false); };
      for (let i = 0; i < 40 && x.mode === 'play'; i++) {
        x.tap(x.hintScrew());
        run(12);
      }
      const st = g.state();
      for (let i = 0; i < 300 && !document.querySelector('[data-testid=next]'); i++) run(1);
      run(60);
      g.step(1 / 30);
      return st;
    });
    await frame.waitForTimeout(1500); // the result card's CSS animations (stars popping in)
    const next = await frame.locator('[data-testid=next]').isVisible();
    const won = level === 1 && s.mode === 'won' && s.tray === 0 && next;
    return { won, why: `level ${level}, mode ${s.mode}, tray ${s.tray}, result card ${next}`, note: `level 1 solved in ${s.taps} taps, result card shown` };
  },
  // ---------------------------------------------------------------- store images (scripts/web/store.mjs)
  /** the main (landscape) cover, cropped to 630:500 around the cage, the hamster and the title */
  cover: { src: 'submission/cover-1920x1080.png', crop: '1361x1080+556+0' },
  /** the square cover (the GamePix icon is the same picture at 256x256) */
  icon: 'submission/cover-800x800.png',
  /** 1280x720 shots of the web build; `?capture=1` hands the frame loop to the script (game time advanced in bulk,
   * one rendered frame per shot); levels played by tapping the solver's best next screw */
  shots: [
    { name: 'start: level 1 for a new player, with the tutorial hand', query: '?q=high&capture=1', run: (f) => taps(f, 0) },
    { name: 'mid-level: level 15, a few screws in the toolboxes', query: '?q=high&capture=1&level=15', save: returning, run: (f) => taps(f, 6) },
    { name: 'mechanics: ice screws (two taps), a lock and its key (level 12)', query: '?q=high&capture=1&level=12', save: returning, run: (f) => taps(f, 3) },
    { name: 'win screen: level 11 (the next level of a returning player), pet rescued', query: '?q=high&capture=1', save: returning, run: (f) => taps(f, 99, 4) },
  ],
};

/** a returning player: ten levels done, tips seen, the daily gift already claimed today (no pop-ups over the level) */
function returning() {
  const d = new Date();
  const last = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rooms = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { stars: 3, bones: 0, best: 10 }]));
  localStorage.setItem('screw-and-rescue.save.v1', JSON.stringify({ v: 1, rooms, coins: 240, daily: { last, streak: 2 }, seenTips: [5, 9, 13, 18, 20, 25, 35] }));
}

/** tap the solver's best next screw `n` times (or until the level ends), each tap's animation played out, then
 * `after` more seconds of game time and one rendered frame */
async function taps(frame, n, after = 2) {
  await frame.evaluate(([n, after]) => {
    const g = window.__game, x = g.game;
    const run = (sec) => { for (let k = 0; k < sec * 30; k++) x.advance(1 / 30, false); };
    run(1.5);
    for (let i = 0; i < n && x.mode === 'play'; i++) {
      x.tap(x.hintScrew());
      run(0.8);
    }
    run(after);
    g.step(1 / 30);
  }, [n, after]);
  await frame.waitForTimeout(2500); // CSS animations (cards, stars, toasts)
}

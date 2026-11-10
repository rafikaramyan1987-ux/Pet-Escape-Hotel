// Game-specific settings for the Playgama zip (scripts/playgama/zip.mjs) and its tests (scripts/playgama/test.mjs).
import web from '../web/game.mjs';

export default {
  slug: web.slug,
  title: 'Screw & Rescue',
  dist: 'dist-playgama',
  exclude: web.exclude,
  /** the game's query for the tests: a new player, level 1 (as in scripts/web/check.mjs) */
  query: 'q=low',
  ready: web.ready,
  /** solve level 1 to its result screen (the frame loop is driven by the script from then on) */
  play: web.play,
  /** the game's state, for the test's debug output */
  state: (frame) => frame.evaluate(() => window.__game?.state()),
  /** the labelled rewarded button: "Watch an ad for +1 tray slot and continue" on the fail card (tray full) */
  reward: {
    selector: '[data-testid=continue]',
    /** bring the button up: level 33 played badly on purpose until the tray is full (as e2e/ads.spec.ts does) */
    async setup(frame) {
      await frame.evaluate(() => {
        const g = window.__game, x = g.game;
        g.start(33, false);
        const q = () => x.puzzle;
        for (let k = 0; k < 200 && q().status === 'play'; k++) {
          const f = q().freeScrews();
          const wrong = f.filter((id) => q().iced[id] || !q().boxes.some((b) => b && b.color === q().screws[id].color));
          x.tap((wrong.length ? wrong : f)[0]);
        }
        for (let i = 0; i < 300 && !document.querySelector('[data-testid=lost]'); i++) x.advance(1 / 30, false);
        g.step(1 / 30);
      });
      await frame.locator('[data-testid=lost]').waitFor({ timeout: 15_000 });
      await frame.waitForTimeout(800);
    },
    /** the value the reward changes: the tray's slots (one more after the ad) */
    value: (frame) => frame.evaluate(() => window.__game.game.puzzle.tray.length),
    /** what the game says when the ad gave nothing (a toast) */
    message: (frame) => frame.evaluate(() => document.getElementById('toast')?.textContent ?? ''),
  },
  /** on the result screen: Next (the between-levels interstitial slot), then the next level opens */
  async next(frame) {
    await frame.locator('[data-testid=next]').click({ force: true });
  },
  async nextLevelOpened(frame) {
    await frame.waitForFunction(() => window.__game?.state().level === 2 && window.__game.state().mode === 'play', null, { timeout: 60_000 });
  },
  /** skip the 2-minute gap before the next interstitial (src/platform/types.ts AdPolicy) */
  skipGap: (frame) => frame.evaluate(() => (window.__playgama.policy.lastAd = 0)),
};

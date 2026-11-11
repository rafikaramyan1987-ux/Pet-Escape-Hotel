# Screw & Rescue — Playgama

## Description

Cute pets are stuck behind wooden planks held by colourful screws. Tap a screw to pull it out: it flies into the box of its colour, or waits in a small tray. Fill the tray and the level is lost, so plan the order! 60 levels, all proven solvable, with locks, ice screws, hidden colours, chains, bombs and sticky planks. Collect 18 pets, dress them up and claim a daily gift. Plays in 10 languages.

## Controls

- **Mouse / touch:** tap or click a screw to take it out (an ice screw needs two taps); tap the booster buttons at the
  bottom (undo, +1 slot, hammer, then tap a plank); drag on empty space to turn the view a little (from level 20,
  optional). No keyboard is needed and the Esc key is not used.

## Tags

puzzle, screw, pets, rescue, logic, brain, strategy, casual, 3d, cute

## Files

| File | What |
|---|---|
| `screw-and-rescue-playgama-v2.zip` | **upload this one.** The Playgama build: `index.html` at the zip root, `playgama-bridge-config.json` beside it, `assets/`; Playgama Bridge from Playgama's CDN, initialized before the game bundle runs; otherwise relative paths only |
| `screw-and-rescue-playgama-v1.zip` | the previous build, kept for reference: **do not upload**. Its vendored single-platform Bridge build had no `qa_tool` adapter, so Playgama's archive check reported "Playgama Bridge never initialized in this archive" (see below) |
| `cover-800x800.png`, `cover-1080x1920.png`, `cover-1920x1080.png` | the three covers Playgama's form takes (square, portrait, landscape), made with Playgama's own covers script from a 1920x1080 screenshot of real play (level 15) and the game's title font (Lilita One) |
| `icon-512x512.png` | icon (same as submission-web/) |

## Playgama Bridge

- **Include:** `<script src="https://bridge.playgama.com/v2/stable/playgama-bridge.js"></script>`, the first script
  in `<head>`, loaded normally: the CDN option Playgama's setup page recommends (wiki.playgama.com/playgama/bridge-sdk/setup;
  `v2/stable` served Bridge 2.4.1 when v2 was built). It loads the adapter of the platform the game runs on, including
  the QA Tool's `qa_tool` adapter that Playgama's archive check uses. Requirement 1.2.5 allows the Bridge, and only it,
  from Playgama's CDN.
- **Why v1 failed the archive check:** v1 shipped a custom single-platform build (`build-dist.ts --type=standalone
  --platform=playgama`), which bundles only the `playgama`, `standalone` and `playgama_sandbox` adapters. Playgama's
  archive check and QA Tool run the game with `?platform_id=qa_tool`; that build has no `qa_tool` adapter, so Bridge fell
  back to its generic base platform (`platform.id` "mock") and never sent the QA Tool its `initialize` handshake. The
  game's own 10 s `Promise.race` and silent catch hid this.
- **Initialization:** index.html's inline boot (scripts/playgama/boot.js) calls `bridge.initialize()` right after the
  Bridge script; the game bundle is held (`<script type="text/plain" data-playgama-game data-src=…>`) and starts only
  once initialize() has settled, so nothing of the game runs or loads before it (Playgama's required step 2). There is
  no timeout of the game's own (a console.warn after 15 s if it is still pending). If initialize() fails, or the
  Bridge script does not load, `console.error("[Playgama Bridge] bridge.initialize() failed; the game runs WITHOUT
  Playgama Bridge …")` and the game plays on with no ads and an in-memory save.
- **Config:** `playgama-bridge-config.json` beside `index.html` (Bridge loads `./playgama-bridge-config.json`);
  the first level after initialization; `game_ready` once the loading screen is gone, always as the first message
  (level 1's `level_started`, sent while it mounts behind the loading screen, is held and follows right after it);
  language from
  `platform.language` (English fallback; a language the player picks in Settings is kept); progress through Bridge
  Storage only (key `screw-and-rescue.save.v1`); interstitials on every Next between levels (only on a rescued level's
  result card, so never in a level and never before the first level is finished) with no counter or timer of the
  game's own: Bridge paces them with its own platform default delay between interstitials (no override in playgama-bridge-config.json) (Playgama's
  interstitial docs);
  rewarded ads only from the labelled "Watch an ad for +1 tray slot and continue" button on the fail card (hidden where
  Bridge has no rewarded ads), with the reward only after Bridge's `rewarded` state; audio muted and the level paused
  during ads, on Bridge's pause state and when the page is hidden; Bridge's audio state mutes.

## Rebuild

```sh
npm ci
npm run submission:playgama   # vite --mode playgama → submission-playgama/screw-and-rescue-playgama-v2.zip
npm run check:playgama        # zip checks + Playgama's precheck (no FAIL, no WARN)
npm run qa:playgama           # Playgama QA Tool harness: ?platform_id=qa_tool, Bridge's initialize handshake, game_ready
npm run test:playgama         # Bridge mock + stubbed Playgama SDK test (Playwright)
```

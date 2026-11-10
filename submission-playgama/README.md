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
| `screw-and-rescue-playgama-v1.zip` | the Playgama build: `index.html` at the zip root, `playgama-bridge.js` (Bridge 2.4.1) + `playgama-bridge-config.json` beside it, `assets/`; relative paths only |
| `cover-800x800.png`, `cover-1080x1920.png`, `cover-1920x1080.png` | the three covers Playgama's form takes (square, portrait, landscape), made with Playgama's own covers script from a 1920x1080 screenshot of real play (level 15) and the game's title font (Lilita One) |
| `icon-512x512.png` | icon (same as submission-web/) |

## Playgama Bridge

- **Version: 2.4.1** (pinned): the official standalone `playgama` build from github.com/Playgama/bridge tag `v2.4.1`,
  vendored in `vendor/playgama-bridge/` (sha256 `b016a8d6…adc25`, checked in CI, reproducible with
  `bash scripts/playgama/build-bridge.sh`). Shipped inside the zip, so the game loads nothing from outside.
- `bridge.initialize()` before the first level; `game_ready` once the loading screen is gone; language from
  `platform.language` (English fallback; a language the player picks in Settings is kept); progress through Bridge
  Storage only (key `screw-and-rescue.save.v1`); interstitials only on Next between levels (at most one per 2 minutes);
  rewarded ads only from the labelled "Watch an ad for +1 tray slot and continue" button on the fail card (hidden where
  Bridge has no rewarded ads), with the reward only after Bridge's `rewarded` state; audio muted and the level paused
  during ads, on Bridge's pause state and when the page is hidden; Bridge's audio state mutes.

## Rebuild

```sh
npm ci
npm run submission:playgama   # vite --mode playgama → submission-playgama/screw-and-rescue-playgama-v1.zip
npm run check:playgama        # zip checks + Playgama's precheck
npm run test:playgama         # Bridge mock + stubbed Playgama SDK test (Playwright)
```

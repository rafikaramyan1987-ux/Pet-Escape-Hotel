# Screw & Rescue

**Tagline:** Plan your taps, fill the toolboxes and free the pets in a cozy 3D screw puzzle!

## Description

Cute pets are stuck behind wooden planks held by colourful screws. Tap a screw to pull it out: it flies into the box of its colour, or waits in a small tray. Fill the tray and the level is lost, so plan the order! 60 levels, all proven solvable, with locks, ice screws, hidden colours, chains, bombs and sticky planks. Collect 18 pets, dress them up and claim a daily gift. Plays in 10 languages.

## Controls

- **Tap / click** a screw to take it out (an ice screw needs two taps).
- **Tap / click** the booster buttons at the bottom (undo, +1 slot, hammer, then tap a plank); boosters cost coins.
- **Drag** on empty space to turn the view a little (from level 20, optional).

## Genre

Puzzle (casual, 3D)

## Tags

puzzle, screw, pets, rescue, logic, brain, strategy, casual, 3d, cute

## Ad-free build

This web build contains **no ads and no portal SDK**: no interstitials, no rewarded-ad buttons (the game is fully
playable without them; boosters are paid with coins earned in the game), no analytics, no external requests (fonts
and all assets are in the zip), no external links.

## Files

| File | What |
|---|---|
| `screw-and-rescue-web-v1.zip` | the game: `index.html` at the zip root + `assets/` + `favicon.svg`, relative paths only (upload as an HTML5 game, "played in the browser") |
| `cover-630x500.png` | itch.io cover, from the main (landscape) cover art |
| `icon-512x512.png` | icon, from the square cover |
| `screenshot-1.png` … `screenshot-4.png` | 1280x720 gameplay: level 1 start (tutorial hand), mid-level (level 15), ice screws and a lock (level 12), win screen |
| `checks/iframe-<w>x<h>.png` | the zip in an iframe at 640x480, 960x600, 1280x720 and 390x844 after level 1 was solved (scripts/web/check.mjs) |

- **Embed size:** any; the game fills its frame (landscape and portrait). Suggested itch.io viewport 960x600,
  "mobile friendly" on, no fullscreen button needed (the game has none of its own; itch.io's works).
- **Saves:** localStorage, key `screw-and-rescue.save.v1` only (a JSON document; progress, coins, pets, settings).

## Rebuild

```sh
npm ci
npm run submission:web     # web build (vite --mode web) → submission-web/screw-and-rescue-web-v1.zip
npm run check:web -- submission-web/screw-and-rescue-web-v1.zip --shots submission-web/checks
npm run store:web          # cover, icon and the four screenshots
```

# Screw & Rescue — GameDistribution submission

**Upload:** `screw-and-rescue-gd-v1.zip` → `index.html` at the zip root, one self-contained file (code, styles and fonts
inlined). Game ID `b25c8dbf41c5409aa7a8fabe7fc7d2e3`.

## Description

Screw & Rescue is a cozy 3D screw puzzle that makes you think. Cute pets are stuck behind planks held by colourful
screws. Tap a screw and it flies into the box of its colour – or waits in a small tray, and a full tray loses. Plan
your order, avoid the traps, free 18 pets, dress them with hats and collars and claim a daily gift. 60 levels, every
one proven solvable; 10 languages.

## Instructions

Tap / click a screw to take it out. It flies into the open box of its colour; with no open box it waits in the tray,
and a full tray loses. Screws under a plank wait until the plank above falls. Boosters: undo, +1 tray slot, hammer.

## Thumbnails

| File | Size |
|---|---|
| `thumb-512x384.jpg` | 512×384 |
| `thumb-512x512.jpg` | 512×512 |
| `thumb-200x120.jpg` | 200×120 |
| `thumb-1280x720.jpg` | 1280×720 |
| `thumb-1280x550.jpg` | 1280×550 |

## SDK integration

- `window.GD_OPTIONS = { gameId, onEvent }`, then `https://html5.api.gamedistribution.com/main.min.js` (script id
  `gamedistribution-jssdk`) loaded at boot
- `SDK_GAME_PAUSE`: gameplay pauses and audio mutes; `SDK_GAME_START`: gameplay resumes, audio comes back if the player's
  own sound setting allows it
- `gdsdk.showAd()` only after a user action: the first Play click (pre-roll), then between levels (Next) at most once
  every 2 minutes; never during a level
- `gdsdk.showAd('rewarded')` only from a rewarded button (boosters, the once-per-level continue); the reward is given on
  `SDK_REWARDED_WATCH_COMPLETE` only. Every request settles exactly once (8 s timeout); when no ad comes the game says
  "No ad available right now, try later"
- Saves in `localStorage`; no external links

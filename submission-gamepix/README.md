# Screw & Rescue — GamePix submission

**Upload:** `screw-and-rescue-gamepix-v1.zip` → `index.html` at the zip root, one self-contained file (code, styles and
fonts inlined). `window.GamePixConfig = { lifecycle: 'manual' }` and the GamePix SDK v3 script
(`https://integration.gamepix.com/sdk/v3/gamepix.sdk.js`) come before the game bundle; it is the only external file.

## Description

Screw & Rescue is a cozy 3D screw puzzle that makes you think. Cute pets are stuck behind planks held by colourful screws. Tap a screw and it flies into the box of its colour – or waits in a small tray, and a full tray loses. Plan your order, avoid the traps, free 18 pets, dress them with hats and collars and claim a daily gift. 60 levels, every one proven solvable.

## How to play

Tap a screw to take it out: it flies into the open box of its colour at the top. A screw whose colour has no open box waits in the tray – when the tray is full, the level is lost. Screws under a plank are stuck until the plank above falls. Watch the grey boxes coming next and take the right screws first. Boosters: undo, +1 tray slot, hammer.

## Files

| File | Size | Use |
|---|---|---|
| `screw-and-rescue-gamepix-v1.zip` | – | game build (`index.html` at the root) |
| `icon-256x256.jpg` | 256×256 | icon |
| `cover-1360x850.jpg` | 1360×850 | cover |

## Integration

- Manual lifecycle: `GamePix.lifecycle.loading(0..100)` while loading, `await GamePix.lifecycle.loaded()` before the title
  screen, `GamePix.lifecycle.gameStart()` when the first level starts
- `GamePix.events.on('pause' / 'resume')`: the game freezes and mutes; `'soundOff' / 'soundOn'` (plus the legacy
  `GamePix.soundOff` / `GamePix.soundOn` hooks): mute / unmute. All idempotent: audio only comes back when no pause, no
  ad and no sound-off is active and the player has not muted the game
- `await GamePix.ads.interstitial()` only between levels (after Next), at most one every 2 minutes; no pre-roll
- `await GamePix.ads.reward()` only from a button the player taps (boosters, the once-per-level continue); the reward is
  given only when `success === true`. Every ad request settles exactly once (8 s timeout); when no ad comes the game
  says "No ad available right now, try later"
- `GamePix.happyMoment('level_complete')` on every rescue, `GamePix.sadMoment('level_failed')` on a failed level
- Language from `GamePix.lang()` (10 languages, English fallback), changeable in Settings
- Progress in `localStorage` under one known key (`screw-and-rescue.save.v1`), no `localStorage.length` / `key(i)`
- No external links, no quit button, no "rotate your device" prompt (portrait and landscape both work)

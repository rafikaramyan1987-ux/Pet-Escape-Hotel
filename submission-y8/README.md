# Screw & Rescue — Y8 submission

Y8 Game ID `292545`, App ID `6af4b159ca1c6869a74e059b`. Everything below is ready to paste into Y8 Studio.

## Game file

| Slot | File |
|---|---|
| Game file (HTML5 zip, iframe hosting) | `screw-and-rescue-y8-v1.zip` — `index.html` alone at the zip root, one self-contained file (code, styles, fonts inlined), relative paths only |

The Y8 SDK is not in the zip: `index.html` loads `https://cdn.y8.com/minimal-sdk/2-0/y8.min.js` (async, in `<head>`)
from Y8's CDN.

Suggested iframe size: 800 × 600 (the game is responsive, portrait and landscape, and fills any frame size).

## Media — which file goes in which slot

All files are in `media/`, rendered from the real game (no mock-ups).

| Y8 slot | Size | File |
|---|---|---|
| Standard Screenshot 1 | 760 × 570 | `media/screenshot-760x570-1.jpg` — level 1 with the tutorial hand |
| Standard Screenshot 2 | 760 × 570 | `media/screenshot-760x570-2.jpg` — level 15, mid-level |
| Standard Screenshot 3 | 760 × 570 | `media/screenshot-760x570-3.jpg` — level 12, ice screws and a lock |
| Standard Screenshot 4 | 760 × 570 | `media/screenshot-760x570-4.jpg` — a rescued pet, result card |
| Widescreen Screenshot 1 | 1280 × 720 | `media/screenshot-1280x720-1.jpg` — level 1 with the tutorial hand |
| Widescreen Screenshot 2 | 1280 × 720 | `media/screenshot-1280x720-2.jpg` — level 15, mid-level |
| Widescreen Screenshot 3 | 1280 × 720 | `media/screenshot-1280x720-3.jpg` — level 12, ice screws and a lock |
| Widescreen Screenshot 4 | 1280 × 720 | `media/screenshot-1280x720-4.jpg` — a rescued pet, result card |
| Landscape Promo | 1920 × 1080 | `media/promo-landscape-1920x1080.jpg` |
| Portrait Promo | 1080 × 1920 | `media/promo-portrait-1080x1920.jpg` |
| Game Card Promo | 760 × 570 | `media/promo-card-760x570.jpg` |
| Gameplay video | 1280 × 720 | `media/gameplay-1280x720.mp4` |
| Gameplay video (4:3) | 960 × 720 | `media/gameplay-960x720.mp4` |

The gameplay video is one continuous take of real play (29 s, H.264, no sound, no intro, no edits): levels 9 and 10
played by the game's own solver bot. The first pet is rescued at about 12 s (crate opens, confetti, three stars), the
second near the end. The 960 × 720 file is the same take rendered at 960 × 720.

## Title

```text
Screw & Rescue
```

## Description

```text
Screw & Rescue is a cozy 3D screw puzzle. Cute pets - dogs, cats and hamsters - are trapped in crates, cages and kennels held shut by colourful screws. Tap a screw and it flies into the toolbox of its colour; with no open box it waits in a small tray, and a full tray loses. Plan your order across 60 handmade levels, each one proven solvable, with ice, chains, locks, hidden screws, sticky planks and bombs. Free 18 pets, dress them with hats and collars, use undo, +1 slot and hammer boosters and claim a daily gift. Progress saves automatically. 10 languages.
```

## Instructions

```text
Click or tap a screw to take it out. It flies into the open toolbox of its colour; with no matching box it waits in the tray, and a full tray loses the level. Screws under a plank wait until the plank above falls. Stuck? Use the boosters: Undo, +1 tray slot, or the Hammer (click it, then click a plank to smash it). Free the pet to win the level.
```

## Supported platforms

```text
Desktop (Chrome, Firefox, Safari, Edge) with mouse; mobile and tablet (iOS Safari, Android Chrome) with touch. Portrait and landscape. WebGL required.
```

## Controls

```text
Mouse: left click. Touch: tap.
```

## Categories / tags (suggested)

```text
Puzzle, Casual, Animal, Logic, 3D, Cute, Mobile
```

## SDK integration (for review)

- `y8.min.js` from Y8's CDN only, async in `<head>`; initialized exactly like the portal snippet: a `y8sdk.ready`
  listener (once) that runs `y8Sdk = y8.sdk()`, `y8Sdk.init({ appId, autoLogin: true }, { gameId, preloadAdBreaks: 'on',
  sound: 'on', onReady })` and `y8Sdk.onAuth(…)`, then `window.y8.emitReadyEvent()` in case the SDK had already loaded.
  Guest play always works. No ad call before init.
- Interstitials: `showAd({ type: 'start' })` on the player's first Play click, `type: 'next'` on Next (rescued) and
  Retry (failed). Never automatic, never during a level, no frequency cap of the game's own (the SDK paces them); when
  no ad shows the game continues at once
- `beforeAd`: the game pauses and all audio mutes; `afterAd`: it resumes and audio comes back through the player's own
  settings. Every request settles exactly once (`adBreakDone`, `.catch()`, or a timeout)
- Rewarded (`type: 'reward'`): only from the booster buttons, which name their reward (Undo, +1 slot, Hammer) next to the
  ad badge, and the fail card's "Watch an ad for +1 tray slot and continue". `showAdFn()` is called in `beforeReward`; the
  reward is granted only in `adViewed`; `adDismissed` = no reward; no ad = "No ad available right now, try later" and the
  game goes on. Nothing essential is behind ads (boosters can also be bought with coins earned in play)
- Pauses and mutes when the page is hidden (`visibilitychange`) or the window loses focus (`blur`), resumes on return
- No other ad network, no external links, no "More games" button; saves in `localStorage`; fully playable with an ad
  blocker or if the SDK fails to load (the rewarded buttons are then hidden)

Rebuild: `npm run submission:y8` (zip + checks), `npm run build && npm run media:y8` (media), `npm run check:y8` (checks only).

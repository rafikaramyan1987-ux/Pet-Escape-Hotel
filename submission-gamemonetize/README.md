# Screw & Rescue — GameMonetize submission

Game ID `qd017r024ijevcoihn7kl2hkyvkw2t7z`. Everything below is ready to paste into the GameMonetize upload form.

## Files to upload

| Form field | File |
|---|---|
| Game file (.zip) | `screw-and-rescue-gamemonetize-v1.zip` — `index.html` alone at the zip root, one self-contained file (code, styles, fonts inlined), relative paths only |
| Thumbnail 512x384 | `screw-and-rescue-512x384.jpg` |
| Thumbnail 512x512 | `screw-and-rescue-512x512.jpg` |
| Thumbnail 512x340 | `screw-and-rescue-512x340.jpg` |

The thumbnails are rendered from the game's own cover scene (the level 4 crate, the dog, cat and hamster) with no text
and no logo; JPG, each under 300 KB.

## Name

```text
Screw & Rescue
```

## Categories

```text
Puzzle, Casual, Animal
```

## Tags

```text
screw puzzle, pin puzzle, unscrew, nuts and bolts, logic, brain, pets, animals, rescue, cute, 3d, casual, mobile, offline, kids
```

## Width / Height

```text
Width: 800
Height: 600
```

The game is responsive (portrait and landscape, any size), so another frame size works as well.

## Optimized for Mobile

```text
Yes
```

Touch controls, portrait and landscape layouts, a light renderer on phones.

## Description (562 characters, max 600)

```text
Screw & Rescue is a cozy 3D screw puzzle. Cute pets - dogs, cats and hamsters - are trapped in crates, cages and kennels held shut by colourful screws. Tap a screw and it flies into the toolbox of its colour; with no open box it waits in a small tray, and a full tray loses. Plan your order across 60 handmade levels, each one proven solvable, with ice, chains, locks, hidden screws, sticky planks and bombs. Free 18 pets, dress them with hats and collars, use undo, +1 slot and hammer boosters and claim a daily gift. Progress saves automatically. 10 languages.
```

## Controls (326 characters, max 350)

```text
Desktop: click a screw to take it out; click the boosters (undo, +1 tray slot, hammer) when you are stuck, then click a plank to smash it with the hammer. Mobile: tap a screw to take it out and tap the boosters the same way. Screws go to the toolbox of their colour, or wait in the tray. Free the pet before the tray fills up.
```

## SDK integration (for review)

- `window.SDK_OPTIONS = { gameId, onEvent }`, then `https://api.gamemonetize.com/sdk.js` injected once at boot
  (`<script id="gamemonetize-sdk">`), never from a click
- `SDK_GAME_PAUSE`: the game pauses and all audio is muted; `SDK_GAME_START`: the game resumes and audio comes back
  through the player's own sound / music settings; `SDK_READY`: interstitials are allowed from then on
- `sdk.showBanner()` only at natural breaks after a player click: Play on the title screen (pre-roll) and Next between
  levels; never during a level, never on a timer, at most one every ~2 minutes. Every request settles exactly once
  (`SDK_GAME_START`, an error, or not started within 8 s)
- No rewarded ads (the SDK has no rewarded API): every "watch an ad" button is hidden in this build
- No other ad network, no external links, no "More games" button; saves in `localStorage`; fully playable when the SDK
  is blocked or fails to load

Rebuild: `npm run submission:gamemonetize` (zip + checks), `npm run build && npm run images:gamemonetize` (thumbnails),
`npm run check:gamemonetize` (checks only).

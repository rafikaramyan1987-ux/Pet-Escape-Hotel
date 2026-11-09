# Screw & Rescue — CrazyGames submission

**Upload:** `screw-and-rescue-v1.zip` → folder `screw-and-rescue-v1/` with a single self-contained `index.html`
(all code, styles and fonts inlined; the CrazyGames SDK v3 script tag is the only external file).

## Short description

Tap the screws, fill the toolboxes and free the pets trapped in crates, cages and kennels!

## Description

Screw & Rescue is a cozy 3D screw puzzle. Cute pets are stuck behind wooden planks held by colourful screws.
Tap a screw to pull it out: it flies into the open toolbox of its colour. No matching box yet? It waits in the
holding tray – but if the tray fills up, you are stuck. Plan which screws to take first, watch the planks fall,
and see the pet jump out and celebrate.

- 100 hand-tuned levels, every one checked by a solver: always solvable, never unfair
- A gentle start: the first 10 levels cannot be lost
- Tricky "boss" level every 10th level, followed by a relaxing one
- Boosters: +1 tray slot, undo and hammer – with coins, or free with an optional ad
- Hints after a few tries, optional camera turn from level 20
- Collect 18 pets, dress them with hats and collars, claim a daily gift
- Colour-blind friendly: every screw colour also has its own symbol
- English and French, portrait and landscape, mouse or touch

## Controls

- **Tap / click** a screw to take it out
- **Tap / click** the booster buttons at the bottom (undo, +1 slot, hammer – then tap a plank)
- **Drag** on empty space to turn the view a little (from level 20, optional)

## Tags

puzzle, screw, pets, rescue, casual, 3d, brain, logic, cute, mobile

## Files

| File | Size | Use |
|---|---|---|
| `screw-and-rescue-v1.zip` | – | game build |
| `cover-1920x1080.png` | 1920×1080 | landscape cover |
| `cover-800x1200.png` | 800×1200 | portrait cover |
| `cover-800x800.png` | 800×800 | square cover (top-left corner kept clear) |
| `trailer-1920x1080.mp4` | 1920×1080, ≤ 20 s | landscape trailer (real gameplay) |
| `trailer-1080x1620.mp4` | 1080×1620, ≤ 20 s | portrait trailer (real gameplay) |

## SDK integration

- `SDK.init()` first, then `loadingStart` / `loadingStop` around boot; `gameplayStart` / `gameplayStop` only around real play
  (stopped on the result card, the fail card, the menu and during ads)
- `happytime()` on every rescue
- Midgame ads only between levels (after "Next"), never before level 4 is done, at most one every ~2 minutes
- Rewarded ads are optional (boosters, continue): every request settles exactly once, with an 8 s timeout for the ad to start;
  when no ad comes the game says "No ad available right now, try later"
- Progress is saved with the Data Module (localStorage fallback); the CrazyGames mute setting is respected
- No external links, no login, no in-app purchases

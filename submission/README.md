# Screw & Rescue — CrazyGames submission

**Upload:** `screw-and-rescue-v1.zip` → folder `screw-and-rescue-v1/` with a single self-contained `index.html`
(all code, styles and fonts inlined; the CrazyGames SDK v3 script tag is the only external file).

## Short description

Plan your taps, fill the toolboxes and free the pets – a cozy 3D screw puzzle that makes you think.

## Description

Screw & Rescue is a cozy 3D screw puzzle. Cute pets are stuck behind wooden planks held by colourful screws.
Tap a screw to pull it out: it flies into the active box of its colour. No matching box? It waits in a small
holding tray – and when the tray is full, the level is lost. Look at the board, watch the next boxes and take the
right screws first: the order you remove them in is the puzzle.

- 60 levels, every one proven solvable by a solver – and never solvable by tapping at random
- Two colour boxes at a time, the next ones shown in grey: plan ahead, avoid the traps, don't fill the tray
- New twists as you go: locked planks, ice screws, hidden colours, chained planks, bomb screws with a countdown and
  sticky planks
- A sawtooth curve: every 5th level is a Hard level, every 10th a Very hard one with a 3-slot tray
- Tray full? Retry instantly, or watch an optional ad for one more tray slot (once per level)
- Moves counter and stars; hints after two tries; optional camera turn from level 20
- Collect 18 pets, dress them with hats and collars, claim a daily gift
- Colour-blind friendly: every screw colour also has its own symbol
- English and French, portrait and landscape, mouse or touch

## Controls

- **Tap / click** a screw to take it out (an ice screw needs two taps)
- **Tap / click** the booster buttons at the bottom (undo, +1 slot, hammer – then tap a plank)
- **Drag** on empty space to turn the view a little (from level 20, optional)

## Tags

puzzle, screw, pets, rescue, logic, brain, strategy, casual, 3d, cute

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
- Rewarded ads are optional and only start from a button the player taps (boosters, the once-per-level continue); the
  reward is given only when the ad completed; every request settles exactly once, with an 8 s timeout for the ad to start;
  when no ad comes the game says "No ad available right now, try later"
- Progress is saved with the Data Module (localStorage fallback); the CrazyGames mute setting is respected
- No external links, no login, no in-app purchases

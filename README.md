# Screw & Rescue

A cute 3D screw puzzle for CrazyGames. Biscuit the dog, Miso the cat and Peanut the hamster are stuck inside crates,
cages and kennels whose fronts are covered with planks held by coloured screws. **Tap a screw**: it spins out and
flies into the open toolbox of its colour (3 screws per box). With no matching box open, it waits in the
**holding tray** (5 slots), and a full tray fails the level. A plank falls when its last screw is out, but a screw
under another plank can't be taken yet (it's dimmed). Clear every plank and the pet hops out.

Built with Three.js, TypeScript and Vite. Single-file CrazyGames build, portrait-first, tap only, EN + FR.

> **Status: phase A.** Levels 1–5 are playable, and the art is in [`docs/art/`](docs/art/). Phase B (100 levels,
> boosters, hints, collection, daily reward, submission covers and trailers) waits for approval.

## Development

```bash
npm install
npm run dev                  # the game
npm run check                # lint + typecheck + unit tests
npm run audit                # exhaustive solver over every level → docs/levels.md (CI fails on any problem)
npm run build                # GitHub Pages build → dist/
npm run build:crazygames     # one self-contained index.html → dist-crazygames/
npm run e2e                  # Playwright (390 px): real taps on level 1, the bot clears 1–5, CrazyGames build checks
node scripts/submission.mjs zip   # submission/screw-and-rescue-v1.zip (index.html inside screw-and-rescue-v1/)
node scripts/record.mjs           # docs/art/levels-1-5-390x844.mp4 (the solver bot playing, 390×844)
```

Web build tooling: `?level=4` opens a level, `?auto=1` lets the solver bot play, `?capture=1` gives frame-exact
control through `window.__game`, and `?cover=landscape|portrait|square` adds the logo for cover art.

## How it's built

| Path | What |
|---|---|
| `src/puzzle/model.ts` | Pure rules: planks, screws, layers and covering, toolbox queue (3 per box), tray, win/lose events |
| `src/puzzle/solver.ts` | Exhaustive solver over the state graph. **Best peak**: the fewest tray slots any winning order needs (hints, bot). **Worst peak / can fail**: what any order of taps can reach |
| `src/puzzle/levels.ts` | The levels. 1–10 must be impossible to fail: the audit and the unit tests check every order of taps |
| `src/puzzle/view.ts` | 3D view: object + pet, planks, screws with colour-blind symbols, toolboxes, tray, spin-out and flight, lid close, plank physics with dust, pet rescue with confetti |
| `src/puzzle/game.ts` | Controller: generous tap picking (52 px+ targets), tutorial hand, results, saves, CrazyGames events |
| `src/art/`, `src/render/` | Reused toy art kit and pet models (Biscuit, Miso, Peanut), render pipeline (MSAA HDR → GTAO → bloom → tone map) |
| `src/platform/` | CrazyGames SDK v3 wrapper (every ad settles exactly once, 8 s start timeout), Data Module saves with localStorage fallback, mute, WebAudio sounds |

### CrazyGames
`SDK.init()` runs first, then `loadingStart` / `loadingStop`. `gameplayStart` / `gameplayStop` wrap real play only,
and `happytime` fires when a pet is rescued. Midgame ads only come between levels: never before level 4 is done, at
most one every ~2 minutes. Rewarded ads are optional (boosters, phase B). The global mute is respected and progress
saves through the Data Module. There are no external links or logins.

## Deploy
GitHub Actions runs lint, typecheck, unit tests, the level audit, both builds, e2e, the single-file checks and the
committed-zip check. It deploys `dist/` to GitHub Pages from `main`.

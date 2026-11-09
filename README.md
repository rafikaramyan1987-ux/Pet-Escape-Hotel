# Screw & Rescue

A cute 3D screw puzzle for CrazyGames. Biscuit the dog, Miso the cat and Peanut the hamster are stuck inside crates,
cages and kennels whose fronts are covered with planks held by coloured screws. **Tap a screw**: it spins out and
flies into the open toolbox of its colour (3 screws per box). With no matching box open, it waits in the
**holding tray** (5 slots), and a full tray fails the level. A plank falls when its last screw is out, but a screw
under another plank can't be taken yet (it's dimmed). Clear every plank and the pet hops out.

Built with Three.js, TypeScript and Vite. Single-file CrazyGames build, portrait-first, tap only, EN + FR.

**100 levels**, every one verified by the solver ([`docs/levels.md`](docs/levels.md)):

- Levels 1–10 cannot be failed (every possible order of taps wins), with a tutorial hand on 1–2
- 11–30 get harder slowly and stay forgiving, 31+ get gradually harder (more colours, planks and layers)
- Every 10th level is a harder **boss**, and the level after it is easy again
- **Boosters** (bottom bar): undo, +1 tray slot, hammer (smash a plank). They're paid from stock, then coins, or with an optional rewarded ad
- A lost level offers **continue with +1 slot**. A **hint** bulb (ring + hand on the best screw) appears after 3 fails
- From level 20, dragging on empty space turns the view a little (never needed to solve a level)
- **Menu**: the pet collection (18 pets, freed by levels), a shop with live try-on (hats, collars), a daily gift (offered to returning players) and settings (sound, music, vibration, EN/FR). Boss levels also give a hat

## Development

```bash
npm install
npm run dev                  # the game
npm run check                # lint + typecheck + unit tests
npm run audit                # exhaustive solver over every level → docs/levels.md (CI fails on any problem)
npm run build                # GitHub Pages build → dist/
npm run build:crazygames     # one self-contained index.html → dist-crazygames/
npm run levels               # regenerate levels 6–100 (seeded, solver-verified) → src/puzzle/levels.json
npm run e2e                  # Playwright (390 px): real taps on level 1, the bot clears 1–5, boosters, continue,
                             # menu + French, CrazyGames build checks and the "no ad available" path
node scripts/submission.mjs zip      # submission/screw-and-rescue-v1.zip (index.html inside screw-and-rescue-v1/)
node scripts/submission.mjs covers   # submission/cover-1920x1080|800x1200|800x800.png (after npm run build)
node scripts/trailer.mjs landscape   # submission/trailer-1920x1080.mp4 (portrait → trailer-1080x1620.mp4), real gameplay
node scripts/record.mjs              # docs/art/levels-1-5-390x844.mp4 (the solver bot playing, 390×844)
```

Web build tooling: `?level=4` opens a level, `?auto=1` lets the solver bot play, `?capture=1` gives frame-exact
control through `window.__game`, and `?cover=landscape|portrait|square` adds the logo for cover art.

## How it's built

| Path | What |
|---|---|
| `src/puzzle/model.ts` | Pure rules: planks, screws, layers and covering, toolbox queue (3 per box), tray, win/lose events |
| `src/puzzle/solver.ts` | Exhaustive solver over the state graph. **Best peak**: the fewest tray slots any winning order needs (hints, bot). **Worst peak / can fail**: what any order of taps can reach |
| `src/puzzle/levels.ts`, `generate.ts` | Levels 1–5 are hand-made. 6–100 come from a seeded generator with a difficulty band per level (colours, planks, layers, screws, random-play fail rate), and each is kept only if the solver proves it. 1–10 must be impossible to fail: the audit and the unit tests check every order of taps |
| `scripts/audit.ts` | CI audit: validity, solver (time limit per level), best-path replay, the playtest bot playing every level, boss/after-boss shape → `docs/levels.md` |
| `src/puzzle/view.ts` | 3D view: object + pet, planks, screws with colour-blind symbols, toolboxes, tray, spin-out and flight, lid close, plank physics with dust, pet rescue with confetti |
| `src/puzzle/game.ts` | Controller: generous tap picking (52 px+ targets), tutorial hand, boosters, continue, hints, view turn, results, collection, saves, CrazyGames events |
| `src/ui/hud.ts`, `src/game/` | HUD, result/fail cards, menu panels (pets, shop, daily, settings). Saves, collection, shop, EN/FR strings |
| `src/art/`, `src/render/` | Reused toy art kit and pet models (Biscuit, Miso, Peanut), render pipeline (MSAA HDR → GTAO → bloom → tone map) |
| `src/platform/` | CrazyGames SDK v3 wrapper (every ad settles exactly once, 8 s start timeout), Data Module saves with localStorage fallback, mute, WebAudio sounds |

### CrazyGames
`SDK.init()` runs first, then `loadingStart` / `loadingStop`. `gameplayStart` / `gameplayStop` wrap real play only,
and `happytime` fires when a pet is rescued. Midgame ads only come between levels: never before level 4 is done, at
most one every ~2 minutes. Rewarded ads are optional (boosters, continue) and settle exactly once: if no ad starts within 8 s, the game says
"No ad available right now, try later" and that button pauses for a moment. The global mute is respected and progress
saves through the Data Module. There are no external links or logins.

## Deploy
GitHub Actions runs lint, typecheck, unit tests, the level audit with the playtest bot, both builds, e2e, the
single-file checks, the committed-zip check and the submission folder check (covers, trailers ≤ 20 s, README). It deploys `dist/` to GitHub Pages from `main`.

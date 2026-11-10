# Screw & Rescue

A cute 3D screw puzzle that makes you plan, for the web (GitHub Pages), CrazyGames, GameDistribution and GamePix. Biscuit the dog, Miso the cat and Peanut the hamster
are stuck inside crates, cages and kennels whose fronts are covered with layered planks held by coloured screws.

**Rules.** Two colour boxes are active at the top, each holds exactly 3 screws; a full box leaves and the next box of
the queue takes its place (the next two are shown small and greyed). **Tap a screw** whose head no plank covers: it
flies into the active box of its colour, or — if its colour has no active box — into the **holding tray** (5 slots on
levels 1–10, 4 from 11, 3 on Very hard levels). **Tray full = level failed**; the free slot glows orange/red with a
warning sound when only one is left. Planks fall (with a shake, a thud and dust) when their last screw is out and free
the screws under them, so the order you take screws in is the puzzle.

Built with Three.js, TypeScript and Vite. One build per platform (single-file portal builds), portrait-first, tap only,
10 languages (English, French, German, Italian, Spanish, Portuguese, Dutch, Polish, Turkish, Russian).

**60 levels**, every one proven solvable without boosters by the solver and checked in CI
([`docs/levels-report.md`](docs/levels-report.md)):

- **Curve**: 1–2 tutorial with a hand pointer; 3–10 easy but you think from the first taps: each has a trap, the first
  real decision by tap 4, and tapping the "obvious" screws (the ones that fly straight into a box) loses at least a
  quarter of the time; from 11 a sawtooth — four normal levels, then a **Hard level** (red badge), and every 10th level
  **Very hard** (3-slot tray).
- **Variety**: levels 1–10 each free a different pet and look different: levels 3–10 each have their own layout pattern
  (ladder, crossed diagonals, gate, fan, zigzag, grid, star), plank shape (wood, metal strip, striped, plywood, round
  stick, cut-corner board), paint and screw colours.
- **Traps**: from level 3 every level has a screw in plain sight whose colour has no active box; tapping it before its
  box comes clogs the tray and makes the level unwinnable.
- **Random-tapping bot** (1000 games per level): easy (3–10) ≥ 60 % fail, normal 70–90 %, Hard 90–98 %, Very hard ≥ 98 %. No
  level can be cleared by tapping in any order. Levels take 12–36 moves (30–90 s).
- **Mechanics**, each with a one-screen tip the first time, then mixed in: locked plank (5, its key screw first), ice
  (9, two taps), hidden colour "?" (13), chain (18, both planks freed before either falls), bomb screw (25, countdown on
  the screw), sticky plank (35, all its screws in one go). Plank widths and four plank looks vary from level to level.
- **Moves counter** and **3 stars** by moves used against the solver's minimum.
- **Boosters**: undo, +1 tray slot, hammer — one of each to start, more with coins or a rewarded ad from a button the
  player taps (rewarded only if the ad really completed). **Tray full**: Retry, or "Watch an ad for +1 tray slot and
  continue" once per level. Hints (the solver's next screw) after 2 fails.
- **Menu**: the pet collection (18 pets), a shop with live try-on (hats, collars), a daily gift and settings (sound,
  music, vibration, language). The language comes from the platform (GamePix.lang(), the CrazyGames SDK locale, the
  browser for GameDistribution / web), falls back to English and is saved when changed.

## Development

```bash
npm install
npm run dev                  # the game
npm run check                # lint + typecheck + unit tests
npm run audit                # solver + random bot over every level → docs/levels-report.md (CI fails on any problem)
npm run build                # GitHub Pages build → dist/ (same as build:web: no SDK, no ads, rewarded buttons hidden)
npm run build:crazygames     # one self-contained index.html → dist-crazygames/
npm run build:gd             # GameDistribution → dist-gd/
npm run build:gamepix        # GamePix → dist-gamepix/
npm run check:i18n           # every language file has all English keys
npm run check:zips           # the committed GD / GamePix / CrazyGames v2 zips (index.html placement, right SDK only)
npm run levels               # regenerate the levels (seeded, tuned to their bands) → src/puzzle/levels.json
npm run e2e                  # Playwright (390 px) on every build: real taps on level 1, the bot clears 1–5, boosters,
                             # text fits in every language, CrazyGames / GD / GamePix SDK flows (stubbed SDKs),
                             # the rewarded continue and the "no ad available" path
node scripts/submission.mjs zip      # submission/screw-and-rescue-v2.zip (index.html inside screw-and-rescue-v2/; v1 kept)
node scripts/submission.mjs gd       # submission-gd/screw-and-rescue-gd-v1.zip + JPG thumbnails (from the covers)
node scripts/submission.mjs gamepix  # submission-gamepix/screw-and-rescue-gamepix-v1.zip + icon + cover
node scripts/submission.mjs covers   # submission/cover-1920x1080|800x1200|800x800.png (after npm run build)
node scripts/trailer.mjs landscape   # submission/trailer-1920x1080.mp4 (portrait → trailer-1080x1620.mp4), real gameplay
node scripts/record-difficulty.mjs   # docs/art/difficulty-v2-390x844.mp4 (solver clears 1, 3, 5, 9, 11, 15, 20; random taps fail)
node scripts/record-first-levels.mjs # docs/art/first-levels-v3-390x844.mp4 (levels 1, 3, 5, 8: careless taps fail, planning wins)
```

Web build tooling: `?level=4` opens a level, `?auto=1` lets the solver bot play, `?capture=1` gives frame-exact
control through `window.__game`, `?lang=de` picks a language and `?cover=landscape|portrait|square` adds the logo for
cover art. Portal builds have none of it.

## How it's built

| Path | What |
|---|---|
| `src/puzzle/model.ts` | Pure rules: layered planks (widths, looks), covered screws, two active boxes and the queue (3 per box), tray (full = fail), locked planks, ice, hidden colours, chains, bomb screws, sticky planks, win/lose events |
| `src/puzzle/solver.ts` | Exhaustive search with state hashing: best tray peak (hints, bot) and `analyze()` — solvable, minimum moves, trap first moves, trap screws, decisions |
| `src/puzzle/solver.ts` | Exhaustive solver over the state graph. **Best peak**: the fewest tray slots any winning order needs (hints, bot). **Worst peak / can fail**: what any order of taps can reach |
| `src/puzzle/levels.ts`, `generate.ts`, `mechanics.ts` | Seeded generator: a random layered layout, the mechanics of its level, then a local search over colours and box queue until the solver and the random bot put the level inside its tier's targets |
| `scripts/audit.ts` | CI audit: solvable, minimum moves, trap first moves, traps, decisions, random-bot fail rate (1000 games) against each tier's target, tray, mechanics order, ≥ 60 levels → `docs/levels-report.md` |
| `src/puzzle/view.ts` | 3D view: object + pet, planks, screws with colour-blind symbols, toolboxes, tray, spin-out and flight, lid close, plank physics with dust, pet rescue with confetti |
| `src/puzzle/game.ts` | Controller: generous tap picking (52 px+ targets), tutorial hand, boosters, continue, hints, view turn, results, collection, saves, CrazyGames events |
| `src/ui/hud.ts`, `src/game/` | HUD, title screen (GD / GamePix), result/fail cards, menu panels (pets, shop, daily, settings). Saves, collection, shop, i18n |
| `src/i18n/*.json` | One JSON per language (10); English is the reference, CI checks every file has all its keys |
| `src/art/`, `src/render/` | Reused toy art kit and pet models (Biscuit, Miso, Peanut), render pipeline (MSAA HDR → GTAO → bloom → tone map) |
| `src/platform/` | Build-time platform layer (`VITE_PLATFORM` = web, crazygames, gd, gamepix; `sdk.ts` picks one, the others are not in the bundle): a common `Platform` interface and `BasePlatform` with the ad safety wrapper (every ad settles exactly once, 8 s start timeout, one at a time, muted and frozen while it plays), saves, mute / pause reasons; one adapter per portal; WebAudio sounds |

### CrazyGames
`SDK.init()` runs first, then `loadingStart` / `loadingStop`. `gameplayStart` / `gameplayStop` wrap real play only,
and `happytime` fires when a pet is rescued. Midgame ads only come between levels: never before level 4 is done, at
most one every ~2 minutes. Rewarded ads are optional (boosters, continue) and settle exactly once: if no ad starts within 8 s, the game says
"No ad available right now, try later" and that button pauses for a moment. The global mute is respected and progress
saves through the Data Module. There are no external links or logins.

### GameDistribution
`window.GD_OPTIONS = { gameId: 'b25c8dbf41c5409aa7a8fabe7fc7d2e3', onEvent }` and `main.min.js` (script id
`gamedistribution-jssdk`) at boot. `SDK_GAME_PAUSE` freezes and mutes the game, `SDK_GAME_START` resumes it (audio back
if the player's own setting allows). `gdsdk.showAd()` only after a user action: the first Play click (pre-roll), then
between levels at most every 2 minutes. `gdsdk.showAd('rewarded')` only from a rewarded button, rewarded on
`SDK_REWARDED_WATCH_COMPLETE` only.

### GamePix
`window.GamePixConfig = { lifecycle: 'manual' }` and `gamepix.sdk.js` before the game bundle. `lifecycle.loading(0..100)`,
`await lifecycle.loaded()` before the title, `lifecycle.gameStart()` when level 1 starts. Pause / resume and sound off /
on arrive through `GamePix.events.on`, the `GamePix.on.<name>` callbacks the SDK calls and the legacy
`GamePix.<name>` hooks; each reason is tracked on its own, so audio only comes back when nothing asks for silence and
the player has not muted. `await GamePix.ads.interstitial()` between levels (2-minute gap), `await GamePix.ads.reward()`
rewards only on `success === true`; `happyMoment('level_complete')`, `sadMoment('level_failed')`. Saves use one known
localStorage key. No external links, no quit button, no rotate prompt.

### Web (GitHub Pages)
No SDK and no ads: the rewarded-ad buttons (continue, the ad badge on boosters) are hidden.

## Deploy
GitHub Actions runs lint, typecheck, unit tests, the i18n key check, the level audit with the playtest bot, all four
builds, e2e on each, the single-file checks, the "only its own SDK" checks, the zip checks (fresh and committed) and the
submission folder checks (CrazyGames covers / trailers / README, GD thumbnails, GamePix icon / cover / README). It
deploys `dist/` to GitHub Pages from `main`.

# Pet Escape Hotel

It's the middle of the night at a cosy pet hotel, and three guests want out. Switch between **Biscuit the dog** (digs
under fences), **Miso the cat** (jumps onto shelves, where nobody can see her) and **Peanut the hamster** (squeezes
through holes and glass pipes). Sneak past the sleepy staff and their flashlights, collect bones and reach the
glowing **EXIT**.

Built with Three.js, TypeScript and Vite for CrazyGames, as a single-file build. Portrait-first, also plays in landscape. EN / FR.

- **40 hand-made rooms** on 5 floors (Lobby, Dining & Kitchen, Spa & Laundry, Garden Terrace, Rooftop). Each floor
  adds one mechanic (squeaky floorboards, paw-button gates, security cameras, the locked rooftop EXIT) and ends with a finale.
- **Staff AI:** patrol, suspicious (the "?" meter fills while they see you), look (they investigate noises and the
  last place they saw you), chase, return and sleep. Running and squeaky boards make noise. Beds, plants, carriers,
  kennels and shelf tops (cat) are hiding spots. Getting caught means "Back to your room!" and a retry.
- **Hints** after 3 fails (a glowing paw trail of the reference route) and **skip** after 5 (optional rewarded ad).
- **Stars:** 1 for escaping, 1 for all 3 bones, 1 for never being spotted. **Coins** buy hats, collars and fur in the
  **shop**, which has a live 3D try-on. There's also a 7-day **daily treat** streak.
- **Controls:** tap / click to walk (pathfinding), WASD / arrows, 1 2 3 / Tab to switch, Shift to run, Space for the ability,
  M for the map. Each pet moves on its own and switching is instant; the follow camera pans smoothly to the active pet.

## Development

```bash
npm install
npm run dev                  # the game
npm run check                # lint + typecheck + unit tests
npm run audit                # playtest bot over all 40 rooms → docs/playtest.md
npm run build                # GitHub Pages build → dist/
npm run build:crazygames     # one self-contained index.html → dist-crazygames/
npm run e2e                  # Playwright (390 px; web + CrazyGames builds)
node scripts/submission.mjs  # submission/: zip, covers, trailers
npm run build && npm run art # docs/art/ (phase-1 art renders)
```

Web build tooling: `?room=3-2` starts a room, `?auto=1` lets the bot play it, `?capture=1` gives frame-exact control
through `window.__game` (used for screenshots and trailers), and `?shot=gameplay|lineup|title|turntable` shows the
art showcase.

## How it's built

| Path | What |
|---|---|
| `src/core/` | Deterministic 30 Hz simulation (no DOM): `level.ts` (ASCII room format), `sim.ts` (pets, staff AI, cameras, noise, gates, key), `path.ts` (ability-aware pathfinding), `bot.ts` (playtest bot), `audit.ts`, `rooms/` (the 40 rooms with their reference plans) |
| `src/render/` | `roomView.ts` (any room as a themed 3D diorama, light cones from the sim's ray casts, follow / map camera), `pipeline.ts` (MSAA HDR → GTAO → bloom → grade → tone map) |
| `src/art/` | Toy modelling kit, pets, staff (porter / chef / maid / gardener / guard), props, procedural textures, rim light + ink outline, cosmetics |
| `src/game/` | Game controller, saves and economy, shop catalogue, EN/FR strings |
| `src/platform/` | CrazyGames SDK v3 wrapper (every ad request settles exactly once), WebAudio synth |
| `src/ui/` | DOM screens: home, floors, HUD, pause, caught, win, shop with 3D try-on, daily treat, settings |
| `tests/` | Vitest: sim rules, all 40 rooms well-formed, ad settlement with fake timers, saves / daily, i18n |

### Playtest bot
The bot follows each room's reference plan (waypoints per pet) but plays it for real against the live AI. Before each
step it simulates ahead and only moves when nothing would notice. Otherwise it waits, backs off or ducks into a hiding
spot. `npm run audit` (also run in CI) checks that every room is solved with all 3 bones, that no pet is noticed in the
first 3 s, that no light camps on a tile of the solution route (lit more than 85 % of the time), and that a
"human-like" noisy bot (shorter look-ahead, reaction delays, impatience) wins often enough for the floor's difficulty.
The results are in [`docs/playtest.md`](docs/playtest.md).

## Deploy
GitHub Actions runs lint, typecheck, unit tests, the playtest audit, both builds and the e2e tests, then deploys `dist/`
to GitHub Pages and uploads the CrazyGames build as an artifact.

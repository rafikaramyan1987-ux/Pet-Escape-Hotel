# Pet Escape Hotel

It's the middle of the night at a cosy pet hotel, and three guests want out. Switch between **Biscuit the dog** (digs
under fences), **Miso the cat** (jumps onto shelves) and **Peanut the hamster** (squeezes through pipes). Sneak past
Bernard, the sleepy night porter, and his flashlight, collect bones, and reach the glowing **EXIT**.

Built with Three.js, TypeScript and Vite for CrazyGames. Portrait-first, also plays in landscape.

> **Status: Phase 1, art direction.** The repo has the 3D art kit, the showcase lobby and the HUD mock-up. There is
> no gameplay yet. The renders are in [`docs/art/`](docs/art/README.md).

## Development

```bash
npm install
npm run dev                 # showcase lobby (live)
npm run build               # GitHub Pages build → dist/
npm run build:crazygames    # one self-contained index.html → dist-crazygames/
npm run lint && npm run typecheck
npm run e2e                 # Playwright smoke tests (web + CrazyGames build)
npm run build && npm run art   # re-render docs/art/ (stills + 10 s turntable mp4, needs ffmpeg)
```

URL parameters for the showcase: `?shot=gameplay|lineup|title|turntable`, `?t=<seconds>` freezes time, `?hud=0` hides
the HUD, and `?q=low` turns off ambient occlusion.

## Layout

| Path | What |
|---|---|
| `src/art/kit.ts` | Modelling kit: soft primitives, toy materials (felt sheen, clear-coat paint), big glossy eyes, idle helpers |
| `src/art/pets.ts`, `porter.ts` | The three pets and the night porter, each with a deterministic idle animation `update(t)` |
| `src/art/props.ts`, `lobby.ts` | Hotel props and the reception lobby diorama, with its lighting |
| `src/art/textures.ts`, `fx.ts` | Procedural canvas textures, light beams, glow sprites (no image files) |
| `src/render/pipeline.ts` | Renderer + post: MSAA HDR → GTAO → bloom → grade/vignette → neutral tone mapping |
| `src/ui/` | HUD mock-up (pet switcher with portraits rendered from the 3D models, bones, stars, stealth meter) |
| `src/showcase/shots.ts` | The art-direction compositions |
| `scripts/render-art.mjs` | Renders `docs/art/` with headless Chromium + ffmpeg |

## Deploy

GitHub Actions (`.github/workflows/ci.yml`) lints, type-checks, builds, runs the Playwright smoke tests, deploys
`dist/` to GitHub Pages and uploads the CrazyGames single-file build as an artifact.

# Pet Escape Hotel: art direction (phase 1)

Every image here is a screenshot of the real Three.js scene (`npm run build && npm run art`). Only the HUD and the logo
are HTML/CSS on top, which is how the game will draw them.

| File | What |
|---|---|
| `gameplay-portrait-1080x1920.png` | Gameplay framing, portrait (the main target), with the HUD mock-up |
| `gameplay-landscape-1920x1080.png` | Same scene, landscape framing and HUD layout |
| `characters-lineup-1920x1080.png` | Biscuit (dog), Miso (cat), Peanut (hamster), Bernard (night porter) |
| `title-cover-1920x1080.png` | Title / cover with the "PET ESCAPE HOTEL" logo |
| `lobby-turntable-10s.mp4` | 10 s camera swing around the lobby (1920×1080, 30 fps) with all idle animations |

## Look

- **Toy diorama.** Each room is a cut-away box on a wooden plinth, floating over a deep indigo night, with two walls
  and the camera at the open corner. Everything is built from soft rounded primitives: no sharp edges, chunky
  proportions, readable silhouettes from a high camera.
- **Materials.** The pets, cushions, curtains and plants use felt with a sheen that catches rim light. The furniture
  is clear-coat painted wood. The eyes and noses are wet gloss, and there's real brass on the fittings.
- **Lighting: warm against cool.** Cool blue moonlight comes through the windows and casts the window-frame shadows
  on the floor, with soft light shafts. Warm lamps (floor lamp, sconces, the banker's lamp on the desk) make amber
  pools. The porter's flashlight is a real shadow-casting spot light plus a visible cone. Gameplay depends on reading
  it. The EXIT sign and floor ring glow green, which is the only green emissive in the room, so the goal is always
  obvious.
- **Post-processing.** GTAO for contact shadows and the ambient-occlusion feel, bloom on emissives only (EXIT,
  bones, lamps, moon), an indigo lift in the shadows, a vignette, and neutral tone mapping so the toy colours stay
  saturated.

## Palette

| Role | Colours |
|---|---|
| Night | `#0e0c26` → `#221d4f` → `#3a2a5e` background, moonlight `#93acff` |
| Interior | wallpaper teal `#4f8790`, wainscot `#8e5636`, honey floor `#c8864e`, cream trim `#f6e7c8` |
| Accents | cranberry `#c2424b`, mustard `#eab04a`, kennel roofs red/yellow/teal, velvet plum `#7d4fa0` |
| Signals | EXIT green `#3ef08a`, bone glow `#ffc36a`, lamp amber `#ffc477` |
| UI | cream cards `#fff4dc`, ink outline `#3b2346`, gold `#ffc548`, red name tags `#e0383e` |

## Characters

- **Biscuit (dog)**: golden fur, cream muzzle and paws, floppy brown ears, red collar with a gold tag. Idle: breathing,
  fast tail wag, ear twitches, head tilt, blinking.
- **Miso (cat)**: grey tabby (forehead "M", back stripes, ringed tail), white muzzle and socks, green slit eyes,
  whiskers. Idle: slow tail swish, ear flicks, curious head tilts.
- **Peanut (hamster)**: an orange and cream ball with puffy cheeks, tiny pink paws holding a sunflower seed, and
  buck teeth. Idle: squishy breathing, nibbling, nose wiggle.
- **Bernard (night porter)**: chunky toy proportions, blue uniform with gold buttons and epaulettes, peaked cap,
  walrus moustache, half-closed sleepy eyes, a flashlight and a key ring. Idle: breathing, slow dozing nod with a
  jerk awake, a lazy flashlight sweep, floating "z"s.

## UI

The UI uses chunky cream cards with a thick ink outline and a hard drop shadow, in Lilita One (titles) and Fredoka
(text), both bundled.

- Top left is the room card (moon icon, "Room 1", "The Lobby", 3 stars).
- Top right are the bones counter, the pause button and the stealth meter ("Zzz…" while the porter sleeps).
- At the bottom is the pet switcher: three round portraits rendered from the 3D models, each with an ability badge
  and a hotkey (1/2/3). The active pet is bigger, with a gold ring and a name tag.
- Bottom right is a big context ability button (DIG / JUMP / SQUEEZE).

The UI scales with the short side of the screen, so it keeps the same proportions on a 390 px phone and on desktop.

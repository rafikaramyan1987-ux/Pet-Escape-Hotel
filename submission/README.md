# Pet Escape Hotel: CrazyGames submission

| File | Notes |
|---|---|
| `pet-escape-hotel-v1.zip` | Upload as HTML5. One self-contained `index.html` inside the folder `pet-escape-hotel-v1/` (JS, CSS and fonts inlined; the only external request is the CrazyGames SDK). About 1 MB. |
| `covers/landscape-1920x1080.png`, `covers/portrait-800x1200.png`, `covers/square-800x800.png` | Rendered from the game's 3D scene; the top-left corner is kept free of text. |
| `trailers/landscape-1920x1080.mp4`, `trailers/portrait-1080x1620.mp4` | 18 s of real gameplay (the playtest bot playing four rooms, HUD on), then the title card. |

Rebuild everything with `node scripts/submission.mjs` (or `zip`, `covers`, `trailers`).

## Title
Pet Escape Hotel

## Short description (EN)
It's night at the pet hotel. Switch between a dog, a cat and a hamster, sneak past the sleepy staff and escape!

## Description (EN)
When the lights go out at the cosy Pet Escape Hotel, three guests decide it's time for an adventure. Biscuit the dog digs under fences, Miso the cat leaps onto shelves where no one can see her, and Peanut the hamster squeezes through holes and glass tubes. Switch between them at any time: every pet moves on its own, so leave the others safely hidden in beds, plants and carriers while you sneak one past the staff.

Bernard the night porter, the chef, the maid, the gardener and the night guard patrol with their flashlights. Stay out of the light, don't run near them (they hear it!), and they'll never know. Five floors, 40 hand-made rooms: the lobby, dining hall and kitchen, spa and laundry, the garden terrace and the rooftop. Each floor brings a new twist: squeaky floorboards, paw-button gates that need teamwork, security cameras and a locked rooftop EXIT. Collect 3 bones per room for stars, earn coins and dress your pets up with hats, collars and new fur.

## Short description (FR)
C'est la nuit à l'hôtel pour animaux. Joue le chien, le chat et le hamster, échappe au personnel endormi et file vers la sortie !

## Description (FR)
Quand les lumières s'éteignent au douillet Pet Escape Hotel, trois pensionnaires décident de partir à l'aventure. Biscuit le chien creuse sous les clôtures, Miso la chatte saute sur les étagères où personne ne la voit, et Cacahuète le hamster se faufile dans les trous et les tubes en verre. Change d'animal quand tu veux : chacun se déplace seul, alors cache les autres dans les lits, les plantes et les caisses pendant que tu en guides un.

Le portier Bernard, le chef, la femme de chambre, le jardinier et le veilleur de nuit patrouillent avec leur lampe torche. Reste hors de la lumière, ne cours pas près d'eux (ils entendent !) et ils n'y verront que du feu. Cinq étages et 40 salles faites à la main : le hall, la salle à manger et la cuisine, le spa et la laverie, la terrasse et le toit. Chaque étage apporte sa nouveauté : lattes qui grincent, grilles à boutons-pattes qu'il faut ouvrir en équipe, caméras de surveillance et SORTIE fermée à clé sur le toit. Ramasse 3 os par salle pour les étoiles, gagne des pièces et habille tes animaux : chapeaux, colliers et nouveaux pelages.

## Controls
- **Touch / mouse:** tap the floor to walk there; tap a portrait (or a pet) to switch; ability button = dig / jump / squeeze next to the pet; the paw button toggles sneak/run; the map button shows the whole room.
- **Keyboard:** WASD or the arrow keys to move · 1 2 3 or Tab to switch pets · Shift to run · Space / E for the ability · M for the map · R to restart · Esc to pause.

## Details
- **Category:** Puzzle (stealth). Also fits Casual, Adventure.
- **Tags:** stealth, pets, puzzle, cute, dog, cat, hamster, escape, 3d, sneak, family, switch characters, mobile.
- **Orientation:** portrait-first on mobile; landscape is supported too.
- **Languages:** English, French.
- **Content:** no violence, no chat, no user content, no purchases with real money (coins come from gameplay and the daily treat).
- **Ads:** midgame ads only between rooms, never before the 3rd room is finished, at most one every ~2 minutes. All rewarded ads are optional: skip a room after 5 tries, and double the daily treat.
- **SDK:** v3 with `init` first, then loading start/stop, gameplay start/stop (paused during ads, menus and when the tab is hidden), `happytime` on each floor finale, Data Module saves (with a localStorage fallback) and the global mute setting.

/** EN / FR strings. The browser language picks the default; the player can switch in settings. */
export type Lang = 'en' | 'fr';

const en = {
  play: 'Play',
  continue: 'Continue',
  floors: 'Floors',
  shop: 'Shop',
  daily: 'Daily treat',
  settings: 'Settings',
  sound: 'Sound',
  music: 'Music',
  language: 'Language',
  on: 'On',
  off: 'Off',
  close: 'Close',
  back: 'Back',
  room: 'Room {n}',
  floor: 'Floor {n}',
  locked: 'Locked',
  finale: 'Finale',
  pause: 'Paused',
  resume: 'Resume',
  restart: 'Restart room',
  home: 'Home',
  map: 'Map',
  hint: 'Hint',
  skip: 'Skip room',
  skipAd: 'Skip room (ad)',
  hintShown: 'Follow the glowing paws!',
  caughtTitle: 'Back to your room!',
  caughtBy: '{who} spotted {pet}.',
  caughtCam: 'A camera spotted {pet}.',
  retry: 'Try again',
  wonTitle: 'Escaped!',
  next: 'Next room',
  replay: 'Replay',
  coins: '+{n} coins',
  bones: 'Bones',
  spotted: 'Never spotted',
  allBones: 'All bones',
  escaped: 'Escaped',
  floorDone: 'Floor {n} cleared!',
  allDone: 'You escaped the whole hotel!',
  noAd: 'No ad available right now, try later',
  watchAd: 'Watch ad',
  claim: 'Claim',
  claimDouble: 'Claim ×2 (ad)',
  day: 'Day {n}',
  dailyText: 'Come back every night for a bigger treat.',
  dailyClaimed: 'See you tomorrow night!',
  buy: 'Buy',
  equip: 'Wear',
  equipped: 'Wearing',
  hats: 'Hats',
  collars: 'Collars',
  skins: 'Fur',
  notEnough: 'Not enough coins',
  run: 'Run',
  sneak: 'Sneak',
  dig: 'Dig',
  jump: 'Jump',
  squeeze: 'Squeeze',
  needKey: 'The EXIT is locked: find the key!',
  gotKey: 'Key found: the EXIT is open!',
  gotBone: 'Bone!',
  pressSwitch: 'Tap a portrait (or 1 2 3) to switch pets',
  tipMove: 'Tap the floor to walk there (or WASD / arrows).',
  controls: 'Tap / click: walk · 1 2 3 / Tab: switch pet · Shift: run · Space: ability · M: map',
  dog: 'Biscuit',
  cat: 'Miso',
  hamster: 'Peanut',
  porter: 'The porter',
  chef: 'The chef',
  maid: 'The maid',
  gardener: 'The gardener',
  guard: 'The night guard',
  tip1: 'Biscuit digs under fences, Miso jumps onto shelves (and can’t be seen up there), Peanut squeezes through holes and pipes. Hide in beds, plants and carriers.',
  tip2: 'Squeaky floorboards make noise, and so does running. Staff come to check on noises.',
  tip3: 'Paw buttons hold gates open while a pet sits on them. Team up!',
  tip4: 'Security cameras never sleep. Watch their sweep and slip past.',
  tip5: 'The rooftop EXIT is locked. Find Bernard’s key first!',
  got: 'Got it!',
  stars: 'Stars',
  everyone: 'Get every pet to the EXIT',
  only: 'Get {pets} to the EXIT',
};

type Dict = typeof en;

const fr: Dict = {
  play: 'Jouer',
  continue: 'Continuer',
  floors: 'Étages',
  shop: 'Boutique',
  daily: 'Friandise du jour',
  settings: 'Réglages',
  sound: 'Son',
  music: 'Musique',
  language: 'Langue',
  on: 'Oui',
  off: 'Non',
  close: 'Fermer',
  back: 'Retour',
  room: 'Salle {n}',
  floor: 'Étage {n}',
  locked: 'Verrouillé',
  finale: 'Finale',
  pause: 'Pause',
  resume: 'Reprendre',
  restart: 'Recommencer',
  home: 'Accueil',
  map: 'Plan',
  hint: 'Indice',
  skip: 'Passer la salle',
  skipAd: 'Passer (pub)',
  hintShown: 'Suis les pattes lumineuses !',
  caughtTitle: 'Retour dans ta chambre !',
  caughtBy: '{who} a repéré {pet}.',
  caughtCam: 'Une caméra a repéré {pet}.',
  retry: 'Réessayer',
  wonTitle: 'Évadés !',
  next: 'Salle suivante',
  replay: 'Rejouer',
  coins: '+{n} pièces',
  bones: 'Os',
  spotted: 'Jamais repéré',
  allBones: 'Tous les os',
  escaped: 'Évadé',
  floorDone: 'Étage {n} terminé !',
  allDone: 'Vous vous êtes évadés de tout l’hôtel !',
  noAd: 'Pas de pub disponible pour le moment, réessaie plus tard',
  watchAd: 'Voir une pub',
  claim: 'Récupérer',
  claimDouble: 'Récupérer ×2 (pub)',
  day: 'Jour {n}',
  dailyText: 'Reviens chaque nuit pour une friandise plus grosse.',
  dailyClaimed: 'À demain soir !',
  buy: 'Acheter',
  equip: 'Porter',
  equipped: 'Porté',
  hats: 'Chapeaux',
  collars: 'Colliers',
  skins: 'Pelage',
  notEnough: 'Pas assez de pièces',
  run: 'Courir',
  sneak: 'Discret',
  dig: 'Creuser',
  jump: 'Sauter',
  squeeze: 'Se faufiler',
  needKey: 'La SORTIE est fermée : trouve la clé !',
  gotKey: 'Clé trouvée : la SORTIE est ouverte !',
  gotBone: 'Un os !',
  pressSwitch: 'Touche un portrait (ou 1 2 3) pour changer d’animal',
  tipMove: 'Touche le sol pour y aller (ou ZQSD / flèches).',
  controls: 'Toucher / clic : marcher · 1 2 3 / Tab : changer · Maj : courir · Espace : capacité · M : plan',
  dog: 'Biscuit',
  cat: 'Miso',
  hamster: 'Cacahuète',
  porter: 'Le portier',
  chef: 'Le chef',
  maid: 'La femme de chambre',
  gardener: 'Le jardinier',
  guard: 'Le veilleur de nuit',
  tip1: 'Biscuit creuse sous les clôtures, Miso saute sur les étagères (invisible là-haut), Cacahuète se faufile dans les trous et les tuyaux. Cache-toi dans les lits, plantes et caisses.',
  tip2: 'Les lattes qui grincent font du bruit, courir aussi. Le personnel vient vérifier.',
  tip3: 'Les boutons-pattes gardent les grilles ouvertes tant qu’un animal est assis dessus. Faites équipe !',
  tip4: 'Les caméras ne dorment jamais. Observe leur balayage et faufile-toi.',
  tip5: 'La SORTIE du toit est fermée. Trouve d’abord la clé de Bernard !',
  got: 'Compris !',
  stars: 'Étoiles',
  everyone: 'Amène tous les animaux à la SORTIE',
  only: 'Amène {pets} à la SORTIE',
};

const dicts: Record<Lang, Dict> = { en, fr };
let lang: Lang = 'en';

export type Key = keyof Dict;

export function detectLang(saved: string): Lang {
  if (saved === 'en' || saved === 'fr') return saved;
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  return nav.startsWith('fr') ? 'fr' : 'en';
}

export function setLang(l: Lang): void {
  lang = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

export function getLang(): Lang {
  return lang;
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  let s = dicts[lang][key] ?? en[key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function name(n: { en: string; fr: string }): string {
  return n[lang];
}

export const DICTS = dicts;

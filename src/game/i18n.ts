/** EN / FR strings. The browser language picks the default; the player can switch in settings. */
export type Lang = 'en' | 'fr';

const en = {
  level: 'Level {n}',
  play: 'Play',
  next: 'Next level',
  retry: 'Try again',
  settings: 'Settings',
  sound: 'Sound',
  music: 'Music',
  vibration: 'Vibration',
  language: 'Language',
  on: 'On',
  off: 'Off',
  close: 'Close',
  rescuedTitle: 'Rescued!',
  rescued: '{pet} is free!',
  coins: '+{n} coins',
  failTitle: 'No space left!',
  failText: 'The tray is full. Pick screws that fit an open toolbox first.',
  tapHint: 'Tap a screw!',
  tapHint2: 'Screws fly into the toolbox of the same colour',
  covered: 'Free the screws on top first',
  moreSoon: 'More levels are on the way!',
  noAd: 'No ad available right now, try later',
  controls: 'Tap a screw to take it out · Fill the toolboxes · Free the pet',
  menu: 'Menu',
  resume: 'Resume',
  collection: 'Pets',
  collectionTitle: 'My pets',
  petsCount: '{n} / {m} pets freed',
  shop: 'Shop',
  daily: 'Daily gift',
  dailyText: 'Come back every day: the gift grows with your streak.',
  dayN: 'Day {n}',
  claim: 'Claim',
  claimed: 'See you tomorrow!',
  hats: 'Hats',
  collars: 'Collars',
  buy: 'Buy',
  equip: 'Wear',
  equipped: 'Worn',
  notEnough: 'Not enough coins',
  boosterSlot: '+1 slot',
  boosterUndo: 'Undo',
  boosterHammer: 'Hammer',
  hammerHint: 'Tap a plank to smash it',
  nothingToUndo: 'Nothing to undo yet',
  watchAd: 'Free with an ad',
  continueSlot: 'Continue (+1 slot)',
  hint: 'Hint',
  hintReady: 'Stuck? Tap the bulb for a hint',
  rotateHint: 'Drag to turn the view',
  newPet: 'New pet for your collection!',
  newHat: 'New hat: {hat}',
  locked: 'Not freed yet',
  bossLevel: 'Tricky level!',
  tip1: 'Free the colour the toolbox needs',
  tip2: 'Follow the queue: the next toolboxes are shown',
  tip3: 'A screw under a plank is stuck: clear the plank on top first',
  tip4: 'Three colours! Choose which plank to clear first',
  tip5: 'Mini-boss! Keep a tray slot free',
  newMechanic: 'New!',
  gotIt: 'Got it',
  mIceTitle: 'Ice',
  mIceText: 'The first tap breaks the ice, the second takes the screw out.',
  mHiddenTitle: 'Mystery screw',
  mHiddenText: 'A ? screw shows its colour only when the plank above it is gone.',
  mChainTitle: 'Chained planks',
  mChainText: 'Chained planks fall together, only when both have lost all their screws.',
  mLockTitle: 'Locks and keys',
  mLockText: 'A locked screw opens once the key screw with the same symbol is out.',
  mBombTitle: 'Bomb plank',
  mBombText: 'Every tap counts down. Make the bomb plank fall before it reaches 0!',
  mStickyTitle: 'Sticky slot',
  mStickyText: 'One tray slot is sticky: it only takes screws of its colour.',
  lockedHint: 'Locked! Take out the key screw first',
  trayFull: 'Tray full!',
  boomTitle: 'Boom!',
  boomText: 'The bomb plank had to fall before the counter ran out.',
  stuckTitle: 'No moves left!',
  stuckText: 'Every screw left is blocked. Try another order.',
  plusSlot: '+1 slot',
  undo3: 'Undo last 3',
  oneContinue: 'One rescue per level',
  dog: 'Biscuit',
  cat: 'Miso',
  hamster: 'Peanut',
};

type Dict = typeof en;

const fr: Dict = {
  level: 'Niveau {n}',
  play: 'Jouer',
  next: 'Niveau suivant',
  retry: 'Réessayer',
  settings: 'Réglages',
  sound: 'Son',
  music: 'Musique',
  vibration: 'Vibration',
  language: 'Langue',
  on: 'Oui',
  off: 'Non',
  close: 'Fermer',
  rescuedTitle: 'Sauvé !',
  rescued: '{pet} est libre !',
  coins: '+{n} pièces',
  failTitle: 'Plus de place !',
  failText: 'Le plateau est plein. Choisis d’abord les vis qui vont dans une boîte ouverte.',
  tapHint: 'Touche une vis !',
  tapHint2: 'Les vis vont dans la boîte à outils de la même couleur',
  covered: 'Libère d’abord les vis du dessus',
  moreSoon: 'D’autres niveaux arrivent bientôt !',
  noAd: 'Pas de pub disponible pour le moment, réessaie plus tard',
  controls: 'Touche une vis pour la retirer · Remplis les boîtes · Libère l’animal',
  menu: 'Menu',
  resume: 'Reprendre',
  collection: 'Animaux',
  collectionTitle: 'Mes animaux',
  petsCount: '{n} / {m} animaux libérés',
  shop: 'Boutique',
  daily: 'Cadeau du jour',
  dailyText: 'Reviens chaque jour : le cadeau grandit avec ta série.',
  dayN: 'Jour {n}',
  claim: 'Récupérer',
  claimed: 'À demain !',
  hats: 'Chapeaux',
  collars: 'Colliers',
  buy: 'Acheter',
  equip: 'Porter',
  equipped: 'Porté',
  notEnough: 'Pas assez de pièces',
  boosterSlot: '+1 case',
  boosterUndo: 'Annuler',
  boosterHammer: 'Marteau',
  hammerHint: 'Touche une planche pour la casser',
  nothingToUndo: 'Rien à annuler pour l’instant',
  watchAd: 'Gratuit avec une pub',
  continueSlot: 'Continuer (+1 case)',
  hint: 'Indice',
  hintReady: 'Bloqué ? Touche l’ampoule pour un indice',
  rotateHint: 'Glisse pour tourner la vue',
  newPet: 'Nouvel animal dans ta collection !',
  newHat: 'Nouveau chapeau : {hat}',
  locked: 'Pas encore libéré',
  bossLevel: 'Niveau difficile !',
  tip1: 'Libère la couleur que la boîte attend',
  tip2: 'Suis la file : les prochaines boîtes sont affichées',
  tip3: 'Une vis sous une planche est bloquée : retire d’abord la planche du dessus',
  tip4: 'Trois couleurs ! Choisis quelle planche libérer en premier',
  tip5: 'Mini-boss ! Garde une case du plateau libre',
  newMechanic: 'Nouveau !',
  gotIt: 'Compris',
  mIceTitle: 'Glace',
  mIceText: 'Le premier toucher casse la glace, le second retire la vis.',
  mHiddenTitle: 'Vis mystère',
  mHiddenText: 'Une vis ? ne montre sa couleur que quand la planche au-dessus est partie.',
  mChainTitle: 'Planches enchaînées',
  mChainText: 'Les planches enchaînées tombent ensemble, seulement quand les deux n’ont plus de vis.',
  mLockTitle: 'Cadenas et clés',
  mLockText: 'Une vis cadenassée s’ouvre quand la vis-clé du même symbole est retirée.',
  mBombTitle: 'Planche bombe',
  mBombText: 'Chaque toucher fait baisser le compteur. Fais tomber la planche avant 0 !',
  mStickyTitle: 'Case collante',
  mStickyText: 'Une case du plateau est collante : elle ne prend que les vis de sa couleur.',
  lockedHint: 'Cadenassée ! Retire d’abord la vis-clé',
  trayFull: 'Plateau plein !',
  boomTitle: 'Boum !',
  boomText: 'La planche bombe devait tomber avant la fin du compteur.',
  stuckTitle: 'Plus de coups !',
  stuckText: 'Toutes les vis restantes sont bloquées. Essaie un autre ordre.',
  plusSlot: '+1 case',
  undo3: 'Annuler les 3 derniers',
  oneContinue: 'Un sauvetage par niveau',
  dog: 'Biscuit',
  cat: 'Miso',
  hamster: 'Cacahuète',
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

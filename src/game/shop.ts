import type { PetKind } from '../art/pets';

/** Cosmetics. Hats and collars fit every pet; skins are per pet. */
export type Slot = 'hat' | 'collar' | 'skin';
export interface ShopItem {
  id: string;
  slot: Slot;
  pet?: PetKind;
  price: number;
  name: { en: string; fr: string };
  color?: number;
  /** Fur colours for skins: [main, dark, cream]. */
  fur?: [number, number, number];
}

export const SHOP: ShopItem[] = [
  { id: 'none', slot: 'hat', price: 0, name: { en: 'No hat', fr: 'Sans chapeau' } },
  { id: 'nightcap', slot: 'hat', price: 60, name: { en: 'Nightcap', fr: 'Bonnet de nuit' }, color: 0x7b86d8 },
  { id: 'party', slot: 'hat', price: 80, name: { en: 'Party hat', fr: 'Chapeau de fête' }, color: 0xe2574c },
  { id: 'bellhop', slot: 'hat', price: 120, name: { en: 'Bellhop cap', fr: 'Calot de groom' }, color: 0xc2424b },
  { id: 'crown', slot: 'hat', price: 250, name: { en: 'Crown', fr: 'Couronne' }, color: 0xf0bd4f },
  { id: 'flower', slot: 'hat', price: 90, name: { en: 'Flower', fr: 'Fleur' }, color: 0xf7a1ad },
  { id: 'default', slot: 'collar', price: 0, name: { en: 'Classic collar', fr: 'Collier classique' } },
  { id: 'bow', slot: 'collar', price: 50, name: { en: 'Bow tie', fr: 'Nœud papillon' }, color: 0x4f9fb0 },
  { id: 'gold', slot: 'collar', price: 150, name: { en: 'Gold collar', fr: 'Collier doré' }, color: 0xf0bd4f },
  { id: 'scarf', slot: 'collar', price: 70, name: { en: 'Scarf', fr: 'Écharpe' }, color: 0x5fae5a },
  { id: 'dalmatian', slot: 'skin', pet: 'dog', price: 200, name: { en: 'Spotty', fr: 'Tacheté' }, fur: [0xf7f3ea, 0x2b2b33, 0xffffff] },
  { id: 'cocoa', slot: 'skin', pet: 'dog', price: 150, name: { en: 'Cocoa', fr: 'Cacao' }, fur: [0x8a5434, 0x4e2c1a, 0xe9c9a2] },
  { id: 'ginger', slot: 'skin', pet: 'cat', price: 150, name: { en: 'Ginger', fr: 'Roux' }, fur: [0xf09a4a, 0xc2602a, 0xfff1de] },
  { id: 'midnight', slot: 'skin', pet: 'cat', price: 200, name: { en: 'Midnight', fr: 'Minuit' }, fur: [0x3a3a4a, 0x22222c, 0xe8e6f0] },
  { id: 'snow', slot: 'skin', pet: 'hamster', price: 150, name: { en: 'Snowball', fr: 'Boule de neige' }, fur: [0xf4f1ec, 0xd8d2c8, 0xffffff] },
  { id: 'choco', slot: 'skin', pet: 'hamster', price: 150, name: { en: 'Choco', fr: 'Choco' }, fur: [0x9a6440, 0x6e4329, 0xf6e2c8] },
];

export const item = (id: string): ShopItem | undefined => SHOP.find((i) => i.id === id);

import type { PetKind } from '../art/pets';

/** Cosmetics sold in the shop. Hats and collars fit every pet (fur colours come from the collection). */
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
];

export const item = (id: string): ShopItem | undefined => SHOP.find((i) => i.id === id);

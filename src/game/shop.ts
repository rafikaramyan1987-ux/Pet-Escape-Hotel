import type { PetKind } from '../art/pets';
import { type Key, t } from './i18n';

/** Cosmetics sold in the shop. Hats and collars fit every pet (fur colours come from the collection). */
export type Slot = 'hat' | 'collar' | 'skin';
export interface ShopItem {
  id: string;
  slot: Slot;
  pet?: PetKind;
  price: number;
  color?: number;
  /** Fur colours for skins: [main, dark, cream]. */
  fur?: [number, number, number];
}

export const SHOP: ShopItem[] = [
  { id: 'none', slot: 'hat', price: 0 },
  { id: 'nightcap', slot: 'hat', price: 60, color: 0x7b86d8 },
  { id: 'party', slot: 'hat', price: 80, color: 0xe2574c },
  { id: 'bellhop', slot: 'hat', price: 120, color: 0xc2424b },
  { id: 'crown', slot: 'hat', price: 250, color: 0xf0bd4f },
  { id: 'flower', slot: 'hat', price: 90, color: 0xf7a1ad },
  { id: 'default', slot: 'collar', price: 0 },
  { id: 'bow', slot: 'collar', price: 50, color: 0x4f9fb0 },
  { id: 'gold', slot: 'collar', price: 150, color: 0xf0bd4f },
  { id: 'scarf', slot: 'collar', price: 70, color: 0x5fae5a },
];

export const item = (id: string): ShopItem | undefined => SHOP.find((i) => i.id === id);

/** The item's name in the current language (key `item_<id>` in src/i18n). */
export const itemName = (id: string): string => t(`item_${id}` as Key);

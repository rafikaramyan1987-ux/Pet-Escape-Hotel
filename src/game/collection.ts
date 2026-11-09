import type { Fur, PetKind } from '../art/pets';

/**
 * The pet collection: every level frees one pet. There are 6 variants of each kind (18 pets); a level's pet is
 * its kind (from the level) and a variant that changes every few levels, so the collection fills up as you play.
 * Boss levels (every 10th) also give a hat.
 */
export interface PetVariant {
  kind: PetKind;
  v: number;
  name: string;
  /** undefined = the approved default fur. */
  fur?: Fur;
}

const VARIANTS: Record<PetKind, { name: string; fur?: Fur }[]> = {
  dog: [
    { name: 'Biscuit' },
    { name: 'Cocoa', fur: [0x8a5434, 0x4e2c1a, 0xe9c9a2] },
    { name: 'Domino', fur: [0xf7f3ea, 0x2b2b33, 0xffffff] },
    { name: 'Honey', fur: [0xf2c46a, 0xc98c3a, 0xfff2d6] },
    { name: 'Pepper', fur: [0x8c8f9c, 0x4a4c58, 0xeceef4] },
    { name: 'Rusty', fur: [0xc8642e, 0x7a3418, 0xf6dcc0] },
  ],
  cat: [
    { name: 'Miso' },
    { name: 'Ginger', fur: [0xf09a4a, 0xc2602a, 0xfff1de] },
    { name: 'Midnight', fur: [0x3a3a4a, 0x22222c, 0xe8e6f0] },
    { name: 'Smoky', fur: [0xa7a9b8, 0x6b6d80, 0xf2f2f8] },
    { name: 'Cream', fur: [0xf3e2c4, 0xd3b48a, 0xffffff] },
    { name: 'Lilac', fur: [0xc6b4d8, 0x8e78a8, 0xf6f0fb] },
  ],
  hamster: [
    { name: 'Peanut' },
    { name: 'Snowball', fur: [0xf4f1ec, 0xd8d2c8, 0xffffff] },
    { name: 'Choco', fur: [0x9a6440, 0x6e4329, 0xf6e2c8] },
    { name: 'Biscotti', fur: [0xe2b27a, 0xb07c44, 0xfff4e2] },
    { name: 'Pebble', fur: [0x9c9890, 0x6a665e, 0xf0eee8] },
    { name: 'Mochi', fur: [0xf6c9cf, 0xd89aa4, 0xfff6f7] },
  ],
};

export const KINDS: PetKind[] = ['dog', 'cat', 'hamster'];
export const VARIANTS_PER_KIND = 6;

export function variant(kind: PetKind, v: number): PetVariant {
  const x = VARIANTS[kind][v % VARIANTS_PER_KIND];
  return { kind, v: v % VARIANTS_PER_KIND, name: x.name, fur: x.fur };
}

/** The pet a level frees. Levels 1–3 give the three default pets. */
export function petOfLevel(id: number, kind: PetKind): PetVariant {
  return variant(kind, Math.floor((id - 1) / 3) % VARIANTS_PER_KIND);
}

export const petId = (p: { kind: PetKind; v: number }): string => `${p.kind}:${p.v}`;

export function allPets(): PetVariant[] {
  return KINDS.flatMap((k) => VARIANTS[k].map((_, v) => variant(k, v)));
}

/** Hats given by boss levels, in order (10, 20, 30…; cycles once all are owned). */
export const BOSS_HATS = ['party', 'nightcap', 'flower', 'bellhop', 'crown'];

export function bossHat(id: number): string | null {
  if (id % 10 !== 0) return null;
  return BOSS_HATS[(id / 10 - 1) % BOSS_HATS.length];
}

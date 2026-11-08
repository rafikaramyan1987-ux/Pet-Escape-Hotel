import type { LevelDef } from '../level';
import { FLOOR1 } from './floor1';
import { FLOOR2 } from './floor2';
import { FLOOR3 } from './floor3';
import { FLOOR4 } from './floor4';
import { FLOOR5 } from './floor5';

/** All 40 hand-made rooms, in play order (5 floors × 8 rooms; room 8 is each floor's finale). */
export const ROOMS: LevelDef[] = [...FLOOR1, ...FLOOR2, ...FLOOR3, ...FLOOR4, ...FLOOR5];

export const FLOOR_NAMES = [
  { en: 'The Lobby', fr: 'Le hall' },
  { en: 'Dining & Kitchen', fr: 'Salle & cuisine' },
  { en: 'Spa & Laundry', fr: 'Spa & laverie' },
  { en: 'Garden Terrace', fr: 'Terrasse & jardin' },
  { en: 'The Rooftop', fr: 'Le toit' },
];

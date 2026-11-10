/** Mechanics mixed into the levels, and the level that introduces each one (with a one-screen tip). */
export type Mechanic = 'lock' | 'ice' | 'hidden' | 'chain' | 'bomb' | 'sticky';

export const MECHANIC_INTRO: Record<Mechanic, number> = { lock: 5, ice: 9, hidden: 13, chain: 18, bomb: 25, sticky: 35 };

export type Tier = 'tutorial' | 'easy' | 'normal' | 'hard' | 'veryhard';

/**
 * Difficulty curve: 1–2 tutorial, 3–10 easy, then a sawtooth: four normal levels, a Hard level (every 5th),
 * and every 10th level Very hard (3-slot tray).
 */
export function tierOf(id: number): Tier {
  if (id <= 2) return 'tutorial';
  if (id <= 10) return 'easy';
  if (id % 10 === 0) return 'veryhard';
  if (id % 5 === 0) return 'hard';
  return 'normal';
}

/** Holding tray: 5 slots on levels 1–10, 4 from 11, 3 on Very hard levels. */
export function trayOf(id: number): number {
  const t = tierOf(id);
  return t === 'veryhard' ? 3 : id <= 10 ? 5 : 4;
}

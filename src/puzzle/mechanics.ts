/** Mechanics mixed into the levels, and the level that introduces each one (with a one-screen tip). */
export type Mechanic = 'ice' | 'hidden' | 'chain' | 'lock' | 'bomb' | 'sticky';

export const MECHANIC_INTRO: Record<Mechanic, number> = { ice: 8, hidden: 14, chain: 20, lock: 30, bomb: 40, sticky: 55 };

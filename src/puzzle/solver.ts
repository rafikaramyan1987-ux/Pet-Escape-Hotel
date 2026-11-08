import { Puzzle } from './model';

/**
 * Exhaustive solver over the puzzle's state graph (states are merged by `Puzzle.key()`).
 *  - best: the smallest "peak tray use" any winning order needs, and that order (hints, the bot)
 *  - worst: the largest tray use any order of taps can reach, and whether any order loses
 *    (levels 1–10 must have canFail = false: every possible sequence of taps wins)
 */
export interface SolveResult {
  solvable: boolean;
  /** Min over winning orders of the peak tray occupancy. */
  bestPeak: number;
  /** tray − bestPeak: how much slack a perfect player has. */
  margin: number;
  /** Max tray occupancy reachable by any order of taps. */
  worstPeak: number;
  canFail: boolean;
  bestPath: number[];
  states: number;
  complete: boolean;
  /** Whether worstPeak/canFail were computed (exhaustive pass). */
  worstChecked: boolean;
  ms: number;
}

export interface SolveOptions {
  /** Explore every order of taps (worst peak, can-fail). Needed for levels 1–10; costly on big levels. */
  worst?: boolean;
  /** State budget; the result says `complete: false` when it runs out. */
  maxStates?: number;
}

export function solve(start: Puzzle, opts: SolveOptions | number = {}): SolveResult {
  const o: SolveOptions = typeof opts === 'number' ? { maxStates: opts, worst: true } : opts;
  const maxStates = o.maxStates ?? 400_000;
  const t0 = Date.now();
  // best peak to win from each state (Infinity = cannot win)
  const memo = new Map<string, { peak: number; move: number }>();
  let states = 0;
  let complete = true;
  const best = (p: Puzzle): number => {
    const k = p.key();
    const hit = memo.get(k);
    if (hit) return hit.peak;
    if (++states > maxStates) {
      complete = false;
      return Infinity;
    }
    const here = p.trayCount();
    if (p.status === 'won') {
      memo.set(k, { peak: here, move: -1 });
      return here;
    }
    if (p.status === 'lost') {
      memo.set(k, { peak: Infinity, move: -1 });
      return Infinity;
    }
    memo.set(k, { peak: Infinity, move: -1 }); // cycle guard (the graph is acyclic anyway)
    let bestPeak = Infinity;
    let bestMove = -1;
    // try moves that need no tray first: finds good orders fast
    const free = p.freeScrews().sort((a, b) => goesToBox(p, b) - goesToBox(p, a));
    for (const s of free) {
      const q = p.clone();
      q.tap(s);
      const peak = Math.max(here, best(q));
      if (peak < bestPeak) {
        bestPeak = peak;
        bestMove = s;
        if (peak === here) break; // can't do better than the current occupancy
      }
    }
    memo.set(k, { peak: bestPeak, move: bestMove });
    return bestPeak;
  };
  const bestPeak = best(start.clone());
  const bestPath: number[] = [];
  if (bestPeak !== Infinity) {
    const p = start.clone();
    while (p.status === 'play') {
      const m = memo.get(p.key())?.move ?? -1;
      if (m < 0) break;
      bestPath.push(m);
      p.tap(m);
    }
  }

  // worst case: explore every reachable state
  let worstPeak = 0;
  let canFail = false;
  const seen = new Set<string>();
  const stack: Puzzle[] = o.worst === false ? [] : [start.clone()];
  while (stack.length) {
    const p = stack.pop()!;
    const k = p.key();
    if (seen.has(k)) continue;
    seen.add(k);
    if (seen.size > maxStates) {
      complete = false;
      break;
    }
    worstPeak = Math.max(worstPeak, p.trayCount());
    if (p.status === 'lost') {
      canFail = true;
      continue;
    }
    if (p.status === 'won') continue;
    for (const s of p.freeScrews()) {
      const q = p.clone();
      q.tap(s);
      stack.push(q);
    }
  }
  return {
    solvable: bestPeak !== Infinity,
    bestPeak,
    margin: start.tray.length - bestPeak,
    worstPeak,
    canFail,
    bestPath,
    states: Math.max(states, seen.size),
    complete,
    worstChecked: o.worst !== false,
    ms: Date.now() - t0,
  };
}

function goesToBox(p: Puzzle, s: number): number {
  const c = p.screws[s].color;
  return p.boxes.some((b) => b && b.color === c && b.screws.length < 3) ? 1 : 0;
}

/** Best next screw from the current state (hints). -1 when the position is lost. */
export function hint(p: Puzzle): number {
  const r = solve(p, { worst: false, maxStates: 60_000 });
  return r.bestPath[0] ?? -1;
}

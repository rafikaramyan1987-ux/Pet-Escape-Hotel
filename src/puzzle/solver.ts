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

/** Per-level difficulty analysis (audit, generator). */
export interface Analysis {
  solvable: boolean;
  /** Taps of a winning order (every screw out, ice needs two taps). */
  minMoves: number;
  /** First moves (free at the start) after which the level can no longer be won. */
  trapFirstMoves: number;
  /**
   * Trap screws: at some point on the winning line the screw is free, its colour has no active box, and tapping
   * it then (before its box comes) makes the level unwinnable — it clogs the tray.
   */
  trapScrews: number[];
  /** Positions on the winning line where some free move wins and some free move loses. */
  decisions: number;
  /**
   * Positions on the winning line where the "obvious" tap is wrong: a free screw whose colour has an active box
   * (it would fly straight into it) makes the level unwinnable, so the player has to look further ahead.
   */
  obviousWrong: number;
  /** Tap number (1-based) of the first decision on the winning line; 0 when there is none. */
  firstDecision: number;
  winPath: number[];
  states: number;
  complete: boolean;
  ms: number;
}

/**
 * Exhaustive win/lose search with state hashing (memo on Puzzle.key()). Moves that fill a box are tried first,
 * so winning lines are found fast; losing subtrees are proven exhaustively.
 */
export function analyze(start: Puzzle, maxStates = 600_000): Analysis {
  const t0 = Date.now();
  const memo = new Map<string, boolean>();
  let states = 0;
  let complete = true;
  const win = (p: Puzzle): boolean => {
    if (p.status === 'won') return true;
    if (p.status === 'lost') return false;
    const k = p.key();
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    if (++states > maxStates) {
      complete = false;
      return false;
    }
    memo.set(k, false);
    const free = p.freeScrews().sort((a, b) => goesToBox(p, b) - goesToBox(p, a));
    let ok = false;
    for (const s of free) {
      const q = p.clone();
      q.tap(s);
      if (win(q)) {
        ok = true;
        break;
      }
    }
    memo.set(k, ok);
    return ok;
  };
  const root = start.clone();
  const solvable = win(root);
  // the first moves that lose
  let trapFirstMoves = 0;
  for (const s of root.freeScrews()) {
    const q = root.clone();
    q.tap(s);
    if (!win(q)) trapFirstMoves++;
  }
  const traps = new Set<number>();
  // the winning line, and the real decisions on it
  const winPath: number[] = [];
  let decisions = 0;
  let obviousWrong = 0;
  let firstDecision = 0;
  if (solvable) {
    const p = root.clone();
    while (p.status === 'play') {
      let good = -1;
      let losing = 0;
      let obvious = 0;
      for (const s of p.freeScrews().sort((a, b) => goesToBox(p, b) - goesToBox(p, a))) {
        const q = p.clone();
        q.tap(s);
        if (win(q)) {
          if (good < 0) good = s;
        } else {
          losing++;
          if (!p.iced[s] && p.boxFor(p.screws[s].color) < 0) traps.add(s);
          else if (!p.iced[s] && !p.screws[s].hidden) obvious++;
        }
      }
      if (good < 0) break;
      if (losing > 0) {
        decisions++;
        if (!firstDecision) firstDecision = winPath.length + 1;
      }
      if (obvious > 0) obviousWrong++;
      winPath.push(good);
      p.tap(good);
    }
  }
  return { solvable, minMoves: winPath.length, trapFirstMoves, trapScrews: [...traps], decisions, obviousWrong, firstDecision, winPath, states, complete, ms: Date.now() - t0 };
}

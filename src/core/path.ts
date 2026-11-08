import { type PetKind, type XY, isPipe, key } from './level';
import type { Sim } from './sim';

/**
 * Shortest path for a pet, honouring its ability (dog: fences, cat: shelves, hamster: holes + pipes).
 * Returns the list of adjacent tiles to step into (a hamster stepping into a pipe end pops out at the other end,
 * so the next step continues from there). `null` when the target is unreachable.
 */
export function findPath(sim: Sim, kind: PetKind, fromX: number, fromY: number, toX: number, toY: number, opts: { gate?: boolean; cost?: (x: number, y: number) => number } = {}): XY[] | null {
  if (fromX === toX && fromY === toY) return [];
  const prev = new Map<number, { from: number; step: XY }>();
  const cost = new Map<number, number>();
  const start = key(fromX, fromY);
  prev.set(start, { from: -1, step: [fromX, fromY] });
  cost.set(start, 0);
  // Dijkstra on a tiny grid: squeaky floor costs more, so quiet routes win when they exist
  const open: { k: number; at: XY; c: number }[] = [{ k: start, at: [fromX, fromY], c: 0 }];
  const done = new Set<number>();
  const goal = key(toX, toY);
  const gateSave = sim.gateOpen;
  if (opts.gate) sim.gateOpen = true;
  try {
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].c < open[bi].c) bi = i;
      const { k, at, c } = open.splice(bi, 1)[0];
      if (done.has(k)) continue;
      done.add(k);
      if (k === goal) break;
      const [x, y] = at;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!sim.canEnter(kind, nx, ny)) continue;
        let land: XY = [nx, ny];
        const ch = sim.tile(nx, ny);
        // stepping onto a pipe end sends the hamster through (unless that end is the goal itself)
        if (kind === 'hamster' && isPipe(ch) && key(nx, ny) !== goal) land = sim.level.pipes.get(key(nx, ny))!;
        // exits end the journey: only step on one when it is the goal
        if (ch === 'E' && key(nx, ny) !== goal) continue;
        const lk = key(land[0], land[1]);
        const nc = c + (ch === '~' ? 8 : 1) + (opts.cost ? opts.cost(nx, ny) : 0);
        if (done.has(lk) || (cost.has(lk) && cost.get(lk)! <= nc)) continue;
        cost.set(lk, nc);
        prev.set(lk, { from: k, step: [nx, ny] });
        open.push({ k: lk, at: land, c: nc });
      }
    }
  } finally {
    sim.gateOpen = gateSave;
  }
  if (!prev.has(goal)) return null;
  const out: XY[] = [];
  let k = goal;
  while (k !== start) {
    const e = prev.get(k)!;
    out.unshift(e.step);
    k = e.from;
  }
  return out;
}

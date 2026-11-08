import type { PetKind } from '../art/pets';
import { BOX_SIZE, COLORS, type Color, type LevelDef, type ObjectKind, PLANK_W, Puzzle, type PlankSpec, buildLevel, plankCovers, validateLevel } from './model';
import { solve } from './solver';

/**
 * Seeded level generator (run offline by `npm run levels`; the result is committed as levels.json and
 * re-verified by the audit in CI). Every candidate is solved exhaustively; only levels the solver fully
 * proves solvable with tray margin ≥ 1 are kept, and levels 1–10 must be impossible to fail.
 *
 * Difficulty is measured by playing 300 random games (a random free screw each tap) and counting losses:
 * random play is far worse than a person, so it is a pessimistic but stable "how forgiving" number.
 */
export interface Band {
  colors: number;
  planks: [number, number];
  layers: number;
  /** Total screws (multiple of 3). */
  screws: [number, number];
  /** Allowed random-play failure rate. */
  fail: [number, number];
  /** Every order of taps must win (levels 1–10). */
  noFail?: boolean;
}

export function bandFor(n: number): Band {
  const boss = n % 10 === 0 && n >= 10;
  const afterBoss = n % 10 === 1 && n > 11;
  if (n <= 10) return { colors: 2, planks: n <= 7 ? [2, 3] : [3, 4], layers: n <= 6 ? 1 : 2, screws: n <= 7 ? [6, 9] : [9, 9], fail: [0, 0], noFail: true };
  if (afterBoss) return { ...bandFor(Math.max(12, n - 8)), fail: [0, 0.2] };
  if (n <= 30) {
    const t = (n - 11) / 19;
    const lo = 9 + 3 * Math.round(t * 2);
    const b: Band = { colors: n < 16 ? 2 : 3, planks: [4, 5 + Math.round(t)], layers: n < 18 ? 2 : 3, screws: [lo, lo + 3], fail: [0, 0.2 + 0.3 * t] };
    if (boss) return { ...b, planks: [5, 7], layers: 3, screws: [lo + 3, lo + 9], fail: [0.3, 0.7] };
    return b;
  }
  const t = Math.min(1, (n - 31) / 69);
  const lo = 15 + 3 * Math.round(t * 3);
  const b: Band = {
    colors: 3 + Math.round(2 * t),
    planks: [5 + Math.round(2 * t), 7 + Math.round(2 * t)],
    layers: 3 + (t > 0.45 ? 1 : 0),
    screws: [lo, lo + 6],
    fail: [0.15 + 0.3 * t, 0.5 + 0.35 * t],
  };
  if (boss) return { ...b, colors: Math.min(6, b.colors + 1), planks: [b.planks[0] + 1, b.planks[1] + 2], layers: b.layers + 1, screws: [lo + 3, lo + 12], fail: [Math.min(0.75, 0.55 + 0.2 * t), 0.97] };
  return b;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const HALF_W = 1.7;
const HALF_H = 1.38;
const OBJECTS: ObjectKind[] = ['crate', 'cage', 'kennel', 'carrier', 'toybox'];
const PETS: PetKind[] = ['dog', 'cat', 'hamster'];

function plankInside(p: PlankSpec): boolean {
  const a = (p.angle * Math.PI) / 180;
  const hx = (Math.abs(Math.cos(a)) * p.len) / 2 + (Math.abs(Math.sin(a)) * PLANK_W) / 2;
  const hy = (Math.abs(Math.sin(a)) * p.len) / 2 + (Math.abs(Math.cos(a)) * PLANK_W) / 2;
  return Math.abs(p.x) + hx <= HALF_W + 0.25 && Math.abs(p.y) + hy <= HALF_H + 0.25;
}

/** Do two planks overlap? (sample points along one, test against the other, both ways) */
function overlaps(a: PlankSpec, b: PlankSpec): boolean {
  const test = (p: PlankSpec, q: PlankSpec) => {
    const r = (p.angle * Math.PI) / 180;
    for (let i = -4; i <= 4; i++) for (const w of [-0.3, 0, 0.3]) {
      const t = (i / 4) * (p.len / 2);
      const x = p.x + Math.cos(r) * t - Math.sin(r) * w;
      const y = p.y + Math.sin(r) * t + Math.cos(r) * w;
      if (plankCovers(q, x, y, 0.06)) return true;
    }
    return false;
  };
  return test(a, b) || test(b, a);
}

function makeLayout(r: () => number, band: Band): PlankSpec[] | null {
  const n = band.planks[0] + Math.floor(r() * (band.planks[1] - band.planks[0] + 1));
  const planks: PlankSpec[] = [];
  let guard = 0;
  while (planks.length < n && guard++ < 1500) {
    const layer = Math.min(band.layers - 1, Math.floor((planks.length * band.layers) / n));
    // layer 0: bars; higher layers: crossing bars and diagonals over them
    const kind = r();
    let angle: number;
    if (layer === 0) angle = kind < 0.6 ? 0 : kind < 0.9 ? 90 : (r() < 0.5 ? 1 : -1) * (20 + r() * 15);
    else angle = kind < 0.35 ? 0 : kind < 0.6 ? 90 : (r() < 0.5 ? 1 : -1) * (22 + r() * 18);
    const vertical = Math.abs(angle) > 60;
    const maxLen = vertical ? 2.75 : Math.abs(angle) > 5 ? 3.6 : 3.4;
    const len = Math.round((1.7 + r() * (maxLen - 1.7)) * 10) / 10;
    const screws = len < 1.9 ? 2 : len < 2.6 ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 2);
    const p: PlankSpec = {
      x: Math.round((r() * 2 - 1) * (HALF_W - (vertical ? 0.4 : 0.6)) * 20) / 20,
      y: Math.round((r() * 2 - 1) * (HALF_H - (vertical ? 0.2 : 0.4)) * 20) / 20,
      len, angle: Math.round(angle), layer, screws: new Array(Math.min(4, screws)).fill('red'), tint: Math.floor(r() * 5),
    };
    if (!plankInside(p)) continue;
    if (planks.some((q) => q.layer === p.layer && overlaps(p, q))) continue;
    // upper planks must actually cover something (that's the point of layers)
    if (layer > 0 && !planks.some((q) => q.layer < layer && overlaps(p, q))) continue;
    if (!spacingOk([...planks, p])) continue;
    planks.push(p);
  }
  if (planks.length < n) return null;
  return planks;
}

/** Screws must not sit on top of each other. Same layer: heads must not touch. Different layers: just never
 * exactly stacked (the lower one only shows once the plank above is gone). */
function spacingOk(planks: PlankSpec[]): boolean {
  const { screws } = buildLevel({ id: 0, object: 'crate', pet: 'dog', planks, queue: [], open: 2, tray: 5 });
  const last = screws.filter((x) => x.plank === planks.length - 1);
  for (const a of last) for (const b of screws) {
    if (b.plank === a.plank) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < (a.layer === b.layer ? 0.52 : 0.3)) return false;
  }
  return true;
}

/** Random-play failure rate (pessimistic forgiveness measure). */
export function randomFailRate(def: LevelDef, games = 300, seed = 7): number {
  const r = rng(seed);
  let fails = 0;
  for (let g = 0; g < games; g++) {
    const p = new Puzzle(def);
    while (p.status === 'play') {
      const free = p.freeScrews();
      if (!free.length) break;
      p.tap(free[Math.floor(r() * free.length)]);
    }
    if (p.status !== 'won') fails++;
  }
  return fails / games;
}

export interface Generated {
  def: LevelDef;
  margin: number;
  failRate: number;
  tries: number;
}

export const rejects: Record<string, number> = {};
const rej = (k: string) => (rejects[k] = (rejects[k] ?? 0) + 1);
export const failSamples: number[] = [];

export function generateLevel(n: number, seed = n * 7919): Generated {
  const band = bandFor(n);
  const r = rng(seed);
  for (let tries = 1; tries <= 4000; tries++) {
    const planks = makeLayout(r, band);
    if (!planks) {
      rej('layout');
      continue;
    }
    let total = planks.reduce((s, p) => s + p.screws.length, 0);
    // make the screw count a multiple of 3 by adding/removing screws on planks that allow it
    for (const p of planks) {
      if (total % BOX_SIZE === 0) break;
      if (p.screws.length < 4 && p.len >= 2.4 && (total % 3 === 2 || p.screws.length <= 2)) {
        p.screws.push('red');
        total++;
      } else if (p.screws.length > 2 && total % 3 === 1) {
        p.screws.pop();
        total--;
      }
    }
    if (total % BOX_SIZE !== 0 || total < band.screws[0] || total > band.screws[1]) {
      rej(`screws ${total}`);
      continue;
    }
    const boxes = total / BOX_SIZE;
    const colors = Math.min(band.colors, boxes);
    if (n > 10 && colors < Math.min(band.colors, 2)) continue;
    // boxes per colour (each colour at least one box)
    const palette = COLORS.slice(0, 8).sort(() => r() - 0.5).slice(0, colors) as Color[];
    const perColor = palette.map(() => 1);
    for (let i = colors; i < boxes; i++) perColor[Math.floor(r() * colors)]++;
    const bag: Color[] = [];
    palette.forEach((c, i) => {
      for (let k = 0; k < perColor[i] * BOX_SIZE; k++) bag.push(c);
    });
    bag.sort(() => r() - 0.5);
    let k = 0;
    for (const p of planks) p.screws = p.screws.map(() => bag[k++]);
    const queue: Color[] = [];
    palette.forEach((c, i) => {
      for (let j = 0; j < perColor[i]; j++) queue.push(c);
    });
    queue.sort(() => r() - 0.5);
    if (band.noFail) {
      // easy levels: both colours open from the start
      queue.sort((a, b) => (a === palette[0] ? -1 : 0) - (b === palette[0] ? -1 : 0));
      if (palette[1]) {
        const i = queue.indexOf(palette[1]);
        queue.splice(i, 1);
        queue.splice(1, 0, palette[1]);
      }
    }
    const def: LevelDef = {
      id: n, object: OBJECTS[(n - 1) % OBJECTS.length], pet: PETS[(n - 1) % PETS.length], open: 2, tray: 5, planks, queue,
    };
    if (validateLevel(def).length) continue;
    const res = solve(new Puzzle(def), { worst: band.noFail === true, maxStates: 250_000 });
    if (!res.complete || !res.solvable || res.margin < 1) {
      rej(!res.complete ? 'incomplete' : !res.solvable ? 'unsolvable' : 'margin');
      continue;
    }
    if (band.noFail && (res.canFail || res.worstPeak >= def.tray)) continue;
    const failRate = band.noFail ? 0 : randomFailRate(def);
    failSamples.push(failRate);
    if (failRate < band.fail[0] || failRate > band.fail[1]) {
      rej('fail band');
      continue;
    }
    return { def, margin: res.margin, failRate, tries };
  }
  throw new Error(`level ${n}: no candidate met the band ${JSON.stringify(band)}`);
}

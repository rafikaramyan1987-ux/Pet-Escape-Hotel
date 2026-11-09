import type { PetKind } from '../art/pets';
import { BOX_SIZE, COLORS, type Color, type LevelDef, type ObjectKind, PLANK_W, Puzzle, type PlankSpec, buildLevel, plankCovers, validateLevel } from './model';
import { solve } from './solver';
import { MECHANIC_INTRO, type Mechanic } from './mechanics';

/**
 * Seeded level generator (run offline by `npm run levels`; the result is committed as levels.json and
 * re-checked by the audit in CI). Every candidate is solved exhaustively and kept only if it hits the level's
 * targets (see `targetFor`): solvable, best-peak margin ≤ 1 (planning needed) and a random-tap failure rate in
 * the band for its stage. Random play = a random free screw each tap, 300 games: no level can be cleared by
 * tapping without thinking, and the bands make the curve rise.
 */
export { MECHANIC_INTRO, type Mechanic } from './mechanics';

export interface Target {
  tray: number;
  /** Random-tap failure rate band (300 games). */
  fail: [number, number];
  /** tray − best peak. */
  margin: [number, number];
  boss: boolean;
}

/** What every level must hit (the audit fails CI on any drift). */
export function targetFor(id: number): Target {
  const boss = id % 10 === 0;
  const tray = id <= 10 ? 3 : id <= 30 ? 4 : 5;
  const fail: [number, number] = boss ? [0.9, 1] : id <= 5 ? [0.15, 0.3] : id <= 10 ? [0.3, 0.5] : id <= 30 ? [0.5, 0.7] : [0.7, 0.9];
  return { tray, fail, margin: [0, 1], boss };
}

export interface Band {
  colors: [number, number];
  planks: [number, number];
  layers: [number, number];
  /** Total screws (multiple of 3). */
  screws: [number, number];
  open: number[];
  /** Margin the generator aims for (within the target). */
  margin: [number, number];
  /** Failure band the generator aims for (a little inside the target, so small code changes don't drift). */
  fail: [number, number];
}

export function bandFor(n: number): Band {
  const tg = targetFor(n);
  const inner: [number, number] = tg.boss ? [0.91, 0.995] : [tg.fail[0] + 0.02, tg.fail[1] - 0.02];
  // the level after a boss sits in the easier half of its band
  if (n % 10 === 1 && n > 10) inner[1] = (inner[0] + inner[1]) / 2;
  const margin: [number, number] = n <= 10 ? [1, 1] : [0, 1];
  let b: Band;
  if (n <= 10) b = { colors: [2, 3], planks: [3, 5], layers: [2, 3], screws: [9, 15], open: [1], margin, fail: inner };
  else if (n <= 30) b = { colors: [3, 4], planks: [4, 6], layers: [2, 4], screws: [12, 21], open: [1, 2], margin, fail: inner };
  else if (n <= 60) b = { colors: [4, 5], planks: [5, 7], layers: [3, 4], screws: [15, 24], open: [2], margin, fail: inner };
  else b = { colors: [5, 6], planks: [5, 8], layers: [3, 5], screws: [18, 27], open: [2], margin, fail: inner };
  // level 1: two colours, two layers, a few planks (a plank on top hides screws you need later)
  if (n === 1) b = { ...b, colors: [2, 2], planks: [3, 4], layers: [2, 2], screws: [12, 15] };
  if (tg.boss && n > 10) b = { ...b, colors: [Math.min(6, b.colors[0] + 1), Math.min(6, b.colors[1] + 1)], planks: [b.planks[0] + 1, b.planks[1] + 1], layers: [Math.min(5, b.layers[0] + 1), Math.min(5, b.layers[1] + 1)], screws: [b.screws[0] + 3, Math.min(30, b.screws[1] + 3)] };
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

const pick = (r: () => number, [a, b]: [number, number]) => a + Math.floor(r() * (b - a + 1));

export function makeLayout(r: () => number, band: Band): PlankSpec[] | null {
  const n = pick(r, band.planks);
  const layers = Math.min(n, pick(r, band.layers));
  const planks: PlankSpec[] = [];
  let guard = 0;
  while (planks.length < n && guard++ < 1500) {
    const layer = Math.min(layers - 1, Math.floor((planks.length * layers) / n));
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

/** Centre the layout in the opening (a shift changes nothing about which screws cover which). */
export function center(planks: PlankSpec[]): void {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of planks) {
    const a = (p.angle * Math.PI) / 180;
    const hx = (Math.abs(Math.cos(a)) * p.len) / 2 + (Math.abs(Math.sin(a)) * PLANK_W) / 2;
    const hy = (Math.abs(Math.sin(a)) * p.len) / 2 + (Math.abs(Math.cos(a)) * PLANK_W) / 2;
    x0 = Math.min(x0, p.x - hx);
    x1 = Math.max(x1, p.x + hx);
    y0 = Math.min(y0, p.y - hy);
    y1 = Math.max(y1, p.y + hy);
  }
  const dx = Math.round(((x0 + x1) / 2) * 100) / 100;
  const dy = Math.round(((y0 + y1) / 2) * 100) / 100;
  for (const p of planks) {
    p.x = Math.round((p.x - dx) * 100) / 100;
    p.y = Math.round((p.y - dy) * 100) / 100;
  }
}

/** spacingOk for every plank of a finished layout. */
function spacingAll(planks: PlankSpec[]): boolean {
  for (let i = 1; i <= planks.length; i++) if (!spacingOk(planks.slice(0, i))) return false;
  return true;
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

export interface Generated {
  def: LevelDef;
  margin: number;
  failRate: number;
  tries: number;
}

export const rejects: Record<string, number> = {};
const rej = (k: string) => (rejects[k] = (rejects[k] ?? 0) + 1);

function shuffle<T>(r: () => number, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Make the screw count a multiple of 3 within [lo, hi] by adding / removing screws where planks allow. */
export function fitScrews(planks: PlankSpec[], lo: number, hi: number): boolean {
  let total = planks.reduce((s, p) => s + p.screws.length, 0);
  for (let pass = 0; pass < 3 && (total % BOX_SIZE !== 0 || total < lo || total > hi); pass++) {
    for (const p of planks) {
      if (total % BOX_SIZE === 0 && total >= lo && total <= hi) break;
      if ((total < lo || total % 3 === 2) && p.screws.length < 4 && p.len >= 2.4) {
        p.screws.push('red');
        total++;
      } else if ((total > hi || total % 3 === 1) && p.screws.length > 2) {
        p.screws.pop();
        total--;
      }
    }
  }
  return total % BOX_SIZE === 0 && total >= lo && total <= hi;
}

/** Colour the screws and build the toolbox queue. */
export function colorize(r: () => number, planks: PlankSpec[], colors: number): Color[] | null {
  const total = planks.reduce((s, p) => s + p.screws.length, 0);
  const boxes = total / BOX_SIZE;
  if (boxes < colors) return null;
  const palette = shuffle(r, COLORS.slice(0, 8) as Color[]).slice(0, colors);
  const perColor = palette.map(() => 1);
  for (let i = colors; i < boxes; i++) perColor[Math.floor(r() * colors)]++;
  const bag: Color[] = [];
  palette.forEach((c, i) => {
    for (let k = 0; k < perColor[i] * BOX_SIZE; k++) bag.push(c);
  });
  shuffle(r, bag);
  let k = 0;
  for (const p of planks) p.screws = p.screws.map(() => bag[k++]);
  const queue: Color[] = [];
  palette.forEach((c, i) => {
    for (let j = 0; j < perColor[i]; j++) queue.push(c);
  });
  return shuffle(r, queue);
}

/** Which mechanics a level uses: its intro mechanic, plus a random mix of the ones already met. */
function mechanicsFor(r: () => number, n: number): Mechanic[] {
  const intro = (Object.keys(MECHANIC_INTRO) as Mechanic[]).find((m) => MECHANIC_INTRO[m] === n);
  if (intro) return [intro];
  const known = (Object.keys(MECHANIC_INTRO) as Mechanic[]).filter((m) => MECHANIC_INTRO[m] < n);
  const out: Mechanic[] = [];
  for (const m of shuffle(r, known)) if (out.length < 2 && r() < 0.4) out.push(m);
  return out;
}

/** Add mechanics to a coloured level (bomb counters are set after a first solve). */
function applyMechanics(r: () => number, def: LevelDef, mech: Mechanic[], intro: boolean): boolean {
  const probe = new Puzzle(def);
  const at = (sid: number) => {
    const s = probe.screws[sid];
    const p = def.planks[s.plank];
    p.mods ??= p.screws.map(() => null);
    const i = probe.planks[s.plank].screws.indexOf(sid);
    p.mods[i] ??= {};
    return p.mods[i]!;
  };
  const plain = (sid: number) => {
    const s = probe.screws[sid];
    const m = def.planks[s.plank].mods?.[probe.planks[s.plank].screws.indexOf(sid)];
    return !m || Object.keys(m).length === 0;
  };
  const ids = shuffle(r, probe.screws.map((s) => s.id));
  for (const m of mech) {
    if (m === 'ice') {
      // intro: the ice is in plain sight
      const pool = ids.filter((k) => plain(k) && (!intro || probe.isUncovered(k)));
      const n = intro ? 3 : 1 + Math.floor(r() * 2);
      if (pool.length < n) return false;
      for (const k of pool.slice(0, n)) at(k).ice = 1;
    } else if (m === 'hidden') {
      const pool = ids.filter((k) => plain(k) && !probe.isUncovered(k));
      const n = intro ? 2 : 1 + Math.floor(r() * 2);
      if (pool.length < n) return false;
      for (const k of pool.slice(0, n)) at(k).hidden = 1;
    } else if (m === 'lock') {
      const pairs = intro ? 1 : 1 + Math.floor(r() * 2);
      for (let sym = 0; sym < pairs; sym++) {
        const lock = ids.find((k) => plain(k));
        const key = ids.find((k) => plain(k) && k !== lock && probe.screws[k].plank !== probe.screws[lock ?? -1]?.plank && (!intro || probe.isUncovered(k)));
        if (lock === undefined || key === undefined) return false;
        at(lock).lock = sym;
        at(key).key = sym;
      }
    } else if (m === 'chain') {
      // two planks on the same layer, side by side
      const order = shuffle(r, def.planks.map((_, i) => i));
      let done = false;
      for (const a of order) {
        for (const b of order) {
          if (a >= b || def.planks[a].layer !== def.planks[b].layer || def.planks[a].chain !== undefined || def.planks[b].chain !== undefined) continue;
          if (Math.hypot(def.planks[a].x - def.planks[b].x, def.planks[a].y - def.planks[b].y) > 2.2) continue;
          def.planks[a].chain = 0;
          def.planks[b].chain = 0;
          done = true;
          break;
        }
        if (done) break;
      }
      if (!done) return false;
    } else if (m === 'sticky') {
      const colors = [...new Set(def.planks.flatMap((p) => p.screws))];
      def.sticky = { slot: def.tray - 1, color: colors[Math.floor(r() * colors.length)] };
    }
  }
  return true;
}

/** Bomb: on a top-layer plank, counter = the taps the best order needs to drop it, plus a little slack. */
function addBomb(r: () => number, def: LevelDef, slackMax: number): boolean {
  const top = Math.max(...def.planks.map((p) => p.layer));
  const cands = def.planks.map((p, i) => ({ p, i })).filter(({ p }) => p.layer === top && p.chain === undefined);
  if (!cands.length) return false;
  const { i } = cands[Math.floor(r() * cands.length)];
  const res = solve(new Puzzle(def), { worst: false, maxStates: 200_000 });
  if (!res.solvable) return false;
  const p = new Puzzle(def);
  let fell = -1;
  for (const m of res.bestPath) {
    p.tap(m);
    if (p.plankGone[i]) {
      fell = p.taps;
      break;
    }
  }
  if (fell < 0) return false;
  def.planks[i].bomb = fell + 2 + Math.floor(r() * (slackMax - 1));
  return true;
}

/** Hand-drawn layouts for levels 1–5 (one new idea each); the generator only picks their colours. */
type Fixed = { colors: number; object: LevelDef['object']; planks: (Omit<PlankSpec, 'screws'> & { n: number })[] };
export const FIXED: Record<number, Fixed> = {
  // 2: the toolbox queue shows the next colours and must be followed
  2: { colors: 2, object: 'crate', planks: [
    { x: 0, y: 0.85, len: 3.3, angle: 0, layer: 0, n: 4, tint: 1 },
    { x: 0, y: 0, len: 3.3, angle: 0, layer: 0, n: 4, tint: 3 },
    { x: 0, y: -0.85, len: 3.3, angle: 0, layer: 0, n: 4, tint: 2 },
    { x: -0.82, y: 0.42, len: 1.9, angle: 90, layer: 1, n: 3, tint: 0 },
    { x: 0.82, y: -0.42, len: 1.9, angle: 90, layer: 1, n: 3, tint: 4 },
  ] },
  // 3: two layers: the screw you need is under another plank
  3: { colors: 2, object: 'crate', planks: [
    { x: -0.85, y: 0, len: 2.6, angle: 90, layer: 0, n: 4, tint: 2 },
    { x: 0.85, y: 0, len: 2.6, angle: 90, layer: 0, n: 4, tint: 3 },
    { x: 0, y: 0.55, len: 3.3, angle: 0, layer: 1, n: 3, tint: 0 },
    { x: 0, y: -0.55, len: 3.3, angle: 0, layer: 1, n: 4, tint: 1 },
  ] },
  // 4: three colours and a crossed plank: the order of removing planks matters
  4: { colors: 3, object: 'cage', planks: [
    { x: 0, y: 0.95, len: 3.2, angle: 0, layer: 0, n: 4, tint: 2 },
    { x: 0, y: -0.95, len: 3.2, angle: 0, layer: 0, n: 4, tint: 3 },
    { x: 0, y: 0, len: 3.5, angle: 28, layer: 1, n: 4, tint: 1 },
    { x: 0, y: 0, len: 3.5, angle: -28, layer: 2, n: 3, tint: 0 },
  ] },
  // 5: mini-boss: three colours, three layers, a small margin
  5: { colors: 3, object: 'kennel', planks: [
    { x: -0.85, y: -0.1, len: 2.6, angle: 90, layer: 0, n: 4, tint: 3 },
    { x: 0.85, y: -0.1, len: 2.6, angle: 90, layer: 0, n: 4, tint: 2 },
    { x: 0, y: 0.62, len: 3.3, angle: 0, layer: 1, n: 3, tint: 1 },
    { x: 0, y: -0.8, len: 3.3, angle: 0, layer: 1, n: 4, tint: 0 },
    { x: 0, y: -0.1, len: 2.2, angle: 90, layer: 2, n: 3, tint: 4 },
  ] },
};

/** How far a level is from its band (0 = inside). Unsolvable or unfinished: huge. */
export function score(def: LevelDef, band: Band, games: number): { score: number; margin: number; fail: number } {
  const res = solve(new Puzzle(def), { worst: false, maxStates: 60_000 });
  if (!res.complete || !res.solvable) return { score: 100, margin: -1, fail: 1 };
  const m = res.margin;
  const mPen = m < band.margin[0] ? band.margin[0] - m : m > band.margin[1] ? m - band.margin[1] : 0;
  const fail = randomFailRate(def, games, 11);
  const fPen = fail < band.fail[0] ? band.fail[0] - fail : fail > band.fail[1] ? fail - band.fail[1] : 0;
  return { score: mPen + fPen * 4, margin: m, fail };
}

/**
 * Local search over the colouring: swap the colours of two screws, or two toolboxes in the queue, and keep the
 * change when the level gets closer to its band. (Blind random colourings almost never land in a band: the
 * danger depends on how many wrong-coloured screws are reachable in each phase.)
 */
export function tuneColors(r: () => number, def: LevelDef, band: Band, iters: number): boolean {
  const flat = () => def.planks.flatMap((p, pi) => p.screws.map((_, si) => [pi, si] as const));
  const cells = flat();
  let cur = score(def, band, 80);
  for (let i = 0; i < iters && cur.score > 0; i++) {
    const undo: (() => void)[] = [];
    const moves = 1 + Math.floor(r() * 2);
    for (let k = 0; k < moves; k++) {
      if (r() < 0.75) {
        const [a, b] = [cells[Math.floor(r() * cells.length)], cells[Math.floor(r() * cells.length)]];
        const ca = def.planks[a[0]].screws[a[1]];
        const cb = def.planks[b[0]].screws[b[1]];
        if (ca === cb) continue;
        def.planks[a[0]].screws[a[1]] = cb;
        def.planks[b[0]].screws[b[1]] = ca;
        undo.push(() => {
          def.planks[a[0]].screws[a[1]] = ca;
          def.planks[b[0]].screws[b[1]] = cb;
        });
      } else {
        const q = def.queue;
        const a = Math.floor(r() * q.length);
        const b = Math.floor(r() * q.length);
        if (q[a] === q[b]) continue;
        [q[a], q[b]] = [q[b], q[a]];
        undo.push(() => ([q[a], q[b]] = [q[b], q[a]]));
      }
    }
    if (!undo.length) continue;
    const next = score(def, band, 80);
    if (next.score <= cur.score) cur = next;
    else for (const u of undo.reverse()) u();
  }
  return cur.score === 0;
}

/** Random-play failure rate (300 games, fixed seed: the audit reproduces it exactly). */
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

export function generateLevel(n: number, seed = n * 7919, maxTries = 6000): Generated {
  const band = bandFor(n);
  const tg = targetFor(n);
  const r = rng(seed);
  const template = FIXED[n];
  for (let tries = 1; tries <= maxTries; tries++) {
    // a template that won't land in its band after 800 tries hands over to the layout search (same idea:
    // its colours and layer count)
    const fixed = tries <= 800 ? template : undefined;
    if (template && !fixed && tries === 801) {
      const layers = new Set(template.planks.map((p) => p.layer)).size;
      Object.assign(band, { colors: [template.colors, template.colors], layers: [layers, layers], planks: [template.planks.length, template.planks.length + 1], screws: [12, 18] });
    }
    let planks: PlankSpec[] | null;
    if (fixed) {
      // the hand-drawn layout, nudged a little each try (screws per plank, small offsets), same idea
      planks = fixed.planks.map(({ n: k, ...p }) => {
        const len = Math.round((p.len + (r() - 0.5) * 0.3) * 10) / 10;
        const cnt = Math.max(2, Math.min(len >= 2.4 ? 4 : 3, k + Math.floor(r() * 3) - 1));
        return { ...p, len, x: Math.round((p.x + (r() - 0.5) * 0.16) * 100) / 100, y: Math.round((p.y + (r() - 0.5) * 0.16) * 100) / 100, screws: new Array(cnt).fill('red') as Color[] };
      });
      if (!spacingAll(planks) || !fitScrews(planks, 12, 18) || !spacingAll(planks)) {
        rej('layout');
        continue;
      }
    } else {
      planks = makeLayout(r, band);
      if (!planks) {
        rej('layout');
        continue;
      }
      if (!fitScrews(planks, band.screws[0], band.screws[1])) {
        rej('screws');
        continue;
      }
    }
    center(planks);
    const colors = fixed ? fixed.colors : pick(r, band.colors);
    const queue = colorize(r, planks, colors);
    if (!queue) {
      rej('colours');
      continue;
    }
    const def: LevelDef = {
      id: n, object: template?.object ?? OBJECTS[(n - 1) % OBJECTS.length], pet: PETS[(n - 1) % PETS.length],
      open: band.open[Math.floor(r() * band.open.length)], tray: tg.tray, planks, queue,
    };
    if (n === 1) def.tutorial = true;
    const mech = fixed ? [] : mechanicsFor(r, n);
    if (!applyMechanics(r, def, mech, MECHANIC_INTRO[mech[0]] === n)) {
      rej('mechanics');
      continue;
    }
    if (validateLevel(def).length) {
      rej('invalid');
      continue;
    }
    if (mech.includes('bomb') && !addBomb(r, def, tg.boss ? 3 : 5)) {
      rej('bomb');
      continue;
    }
    if (!tuneColors(r, def, band, 120)) {
      rej('tune');
      continue;
    }
    const res = solve(new Puzzle(def), { worst: false, maxStates: 400_000 });
    if (!res.complete || !res.solvable || res.margin < band.margin[0] || res.margin > band.margin[1]) {
      rej('verify');
      continue;
    }
    const failRate = randomFailRate(def);
    if (failRate < band.fail[0] || failRate > band.fail[1]) {
      rej(failRate < band.fail[0] ? 'too easy' : 'too hard');
      continue;
    }
    return { def, margin: res.margin, failRate, tries };
  }
  throw new Error(`level ${n}: no candidate met the band ${JSON.stringify(band)} (${JSON.stringify(rejects)})`);
}

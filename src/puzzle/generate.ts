import type { PetKind } from '../art/pets';
import { MECHANIC_INTRO, type Mechanic, type Tier, tierOf, trayOf } from './mechanics';
import { BOX_SIZE, COLORS, type Color, type LevelDef, type ObjectKind, OPEN_BOXES, Puzzle, type PlankSpec, type PlankStyle, buildLevel, plankCovers, plankWidth, validateLevel } from './model';
import { analyze } from './solver';

export { MECHANIC_INTRO, type Mechanic, tierOf, trayOf } from './mechanics';

/**
 * Seeded level generator (run offline by `npm run levels`; the result is committed as levels.json and
 * re-checked by the audit in CI). A candidate is a random layered layout; a local search then tunes its colours
 * and box queue until the level hits the targets of its tier (see `targetFor`), all proven by the solver:
 * solvable without boosters, a random-tapping bot (1000 games) failing inside the tier's band, at least one trap
 * from level 3 (a screw in plain sight whose box is not active and that makes the level unwinnable if tapped too
 * early) and real decisions on the winning line.
 */
export interface Target {
  tier: Tier;
  tray: number;
  /** Random-tap failure rate band (1000 games). */
  fail: [number, number];
  /** At least this many trap screws (in plain sight, no active box, tapping it before its box comes loses). */
  traps: number;
  /** At least this many decisions on the winning line. */
  decisions: number;
  /** Winning line length (taps): 30–90 s of real play at ~2.5 s per tap. */
  moves: [number, number];
  /** The first decision on the winning line must come by this tap (0 = no limit): you think from the first taps. */
  firstDecision: number;
  /** "Obvious" bot (always a screw that flies straight into its box when there is one): at least this fail rate. */
  greedyFail: number;
}

/** Levels 3–10: a real decision within the first taps, and playing the "obvious" screws is not enough. */
export const EARLY_FIRST_DECISION = 4;
export const EARLY_GREEDY_FAIL = 0.25;

export function targetFor(id: number): Target {
  const tier = tierOf(id);
  const fail: Record<Tier, [number, number]> = {
    tutorial: [0.03, 0.35],
    easy: [0.6, 0.9],
    normal: [0.7, 0.9],
    hard: [0.9, 0.98],
    veryhard: [0.98, 1],
  };
  const early = tier === 'easy';
  return {
    tier, tray: trayOf(id), fail: fail[tier], traps: id >= 3 ? 1 : 0, decisions: id >= 3 ? 2 : 0, moves: [12, 36],
    firstDecision: early ? EARLY_FIRST_DECISION : 0, greedyFail: early ? EARLY_GREEDY_FAIL : 0,
  };
}

export interface Band {
  colors: [number, number];
  planks: [number, number];
  layers: [number, number];
  /** Total screws (multiple of 3). */
  screws: [number, number];
  /** Failure band the generator aims for (a little inside the target, so small code changes don't drift). */
  fail: [number, number];
}

export function bandFor(n: number): Band {
  const tg = targetFor(n);
  // easy levels aim at the low end of their band, so they stay a step below the normal levels
  const inner: [number, number] = tg.tier === 'veryhard' ? [0.985, 1] : tg.tier === 'easy' ? [0.62, 0.8] : [tg.fail[0] + 0.02, tg.fail[1] - 0.02];
  const late = n > 30;
  const b: Record<Tier, Band> = {
    tutorial: { colors: [2, 3], planks: [3, 4], layers: [2, 2], screws: [12, 15], fail: inner },
    easy: { colors: [3, 4], planks: [4, 6], layers: [2, 3], screws: [12, 18], fail: inner },
    normal: late ? { colors: [4, 6], planks: [5, 8], layers: [3, 5], screws: [15, 24], fail: inner } : { colors: [4, 5], planks: [5, 7], layers: [3, 4], screws: [15, 21], fail: inner },
    hard: { colors: [4, 6], planks: [5, 8], layers: [3, 5], screws: [15, 24], fail: inner },
    veryhard: { colors: [4, 6], planks: [5, 8], layers: [3, 5], screws: [15, 24], fail: inner },
  };
  return b[tg.tier];
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
/** Plank widths: narrow strips, standard planks, wide boards. */
const WIDTHS = [0.56, 0.72, 0.72, 0.9];

function halfExtents(p: PlankSpec): [number, number] {
  const a = (p.angle * Math.PI) / 180;
  const w = plankWidth(p);
  return [(Math.abs(Math.cos(a)) * p.len) / 2 + (Math.abs(Math.sin(a)) * w) / 2, (Math.abs(Math.sin(a)) * p.len) / 2 + (Math.abs(Math.cos(a)) * w) / 2];
}

function plankInside(p: PlankSpec): boolean {
  const [hx, hy] = halfExtents(p);
  return Math.abs(p.x) + hx <= HALF_W + 0.25 && Math.abs(p.y) + hy <= HALF_H + 0.25;
}

/** Do two planks overlap? (sample points along one, test against the other, both ways) */
function overlaps(a: PlankSpec, b: PlankSpec): boolean {
  const test = (p: PlankSpec, q: PlankSpec) => {
    const r = (p.angle * Math.PI) / 180;
    const hw = plankWidth(p) * 0.42;
    for (let i = -4; i <= 4; i++) for (const w of [-hw, 0, hw]) {
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

/**
 * Layout patterns for the first levels, so each one looks different: the direction of the planks on the bottom
 * layer and on the layers above.
 */
export type Pattern = 'random' | 'ladder' | 'gate' | 'cross' | 'fan' | 'zigzag' | 'grid' | 'star';

/** The look of levels 3–10: layout pattern, plank shapes (styles), paint, widths and the screw palette. */
export interface EarlyLook {
  pattern: Pattern;
  styles: PlankStyle[];
  tints: number[];
  widths: number[];
  /** Screw colours this level draws from (first ones first). */
  palette: Color[];
}

export const EARLY_LOOKS: Record<number, EarlyLook> = {
  3: { pattern: 'ladder', styles: [0], tints: [0], widths: [0.9], palette: ['red', 'blue', 'yellow', 'green'] },
  4: { pattern: 'cross', styles: [1], tints: [1, 3], widths: [0.56, 0.72], palette: ['purple', 'orange', 'teal', 'pink'] },
  5: { pattern: 'gate', styles: [4], tints: [2, 4], widths: [0.72], palette: ['green', 'yellow', 'red', 'purple'] },
  6: { pattern: 'fan', styles: [2], tints: [3], widths: [0.72, 0.9], palette: ['blue', 'pink', 'orange', 'green'] },
  7: { pattern: 'zigzag', styles: [5], tints: [4, 0], widths: [0.72, 0.9], palette: ['teal', 'red', 'yellow', 'purple'] },
  8: { pattern: 'grid', styles: [3, 1], tints: [0, 2], widths: [0.56, 0.72], palette: ['orange', 'blue', 'green', 'pink'] },
  9: { pattern: 'star', styles: [4, 0], tints: [1, 4], widths: [0.72], palette: ['pink', 'teal', 'purple', 'yellow'] },
  10: { pattern: 'random', styles: [5, 2], tints: [3, 2], widths: [0.56, 0.9], palette: ['yellow', 'red', 'blue', 'teal'] },
};

const diag = (r: () => number, lo: number, hi: number, sign: number) => sign * (lo + r() * (hi - lo));

/** Plank angle for a pattern (degrees). `i` = index of the plank in its layer. */
function patternAngle(pt: Pattern, r: () => number, layer: number, i: number): number {
  const alt = i % 2 ? -1 : 1;
  switch (pt) {
    case 'ladder':
      return layer === 0 ? 0 : 90;
    case 'gate':
      return layer === 0 ? 90 : 0;
    case 'cross':
      return layer === 0 ? diag(r, 24, 34, alt) : r() < 0.5 ? 0 : 90;
    case 'fan':
      return diag(r, 22, 42, layer % 2 ? -alt : alt);
    case 'zigzag':
      return layer === 0 ? diag(r, 16, 26, alt) : 90;
    case 'grid':
      return (i + layer) % 2 ? 90 : 0;
    case 'star':
      return layer === 0 ? 0 : diag(r, 34, 44, alt);
    default: {
      const kind = r();
      if (layer === 0) return kind < 0.55 ? 0 : kind < 0.85 ? 90 : (r() < 0.5 ? 1 : -1) * (20 + r() * 15);
      return kind < 0.35 ? 0 : kind < 0.6 ? 90 : (r() < 0.5 ? 1 : -1) * (22 + r() * 18);
    }
  }
}

export function makeLayout(r: () => number, band: Band, look?: EarlyLook): PlankSpec[] | null {
  const n = pick(r, band.planks);
  const layers = Math.min(n, pick(r, band.layers));
  const planks: PlankSpec[] = [];
  let guard = 0;
  while (planks.length < n && guard++ < 1500) {
    const layer = Math.min(layers - 1, Math.floor((planks.length * layers) / n));
    // layer 0: bars; higher layers: crossing bars and diagonals over them (or the early level's pattern)
    const angle = patternAngle(look?.pattern ?? 'random', r, layer, planks.filter((q) => q.layer === layer).length);
    const vertical = Math.abs(angle) > 60;
    const maxLen = vertical ? 2.75 : Math.abs(angle) > 5 ? 3.6 : 3.4;
    const len = Math.round((1.7 + r() * (maxLen - 1.7)) * 10) / 10;
    const screws = len < 1.9 ? 2 : len < 2.6 ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 2);
    const widths = look?.widths ?? WIDTHS;
    const w = widths[Math.floor(r() * widths.length)];
    const tint = look ? look.tints[planks.length % look.tints.length] : Math.floor(r() * 5);
    const style = look ? look.styles[planks.length % look.styles.length] : (Math.floor(r() * 4) as PlankStyle);
    const p: PlankSpec = {
      x: Math.round((r() * 2 - 1) * (HALF_W - (vertical ? 0.4 : 0.6)) * 20) / 20,
      y: Math.round((r() * 2 - 1) * (HALF_H - (vertical ? 0.2 : 0.4)) * 20) / 20,
      len, angle: Math.round(angle), layer, screws: new Array(Math.min(4, screws)).fill('red'),
      w, tint, style,
    };
    if (w === 0.72) delete p.w;
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
    const [hx, hy] = halfExtents(p);
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

/** Colour the screws and build the box queue (the palette changes from level to level). */
export function colorize(r: () => number, planks: PlankSpec[], colors: number, from?: Color[]): Color[] | null {
  const total = planks.reduce((s, p) => s + p.screws.length, 0);
  const boxes = total / BOX_SIZE;
  if (boxes < colors) return null;
  const palette = from ? from.slice(0, colors) : shuffle(r, COLORS.slice(0, 8) as Color[]).slice(0, colors);
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

/** Which mechanics a level uses: its intro mechanic, plus a mix of the ones already met. */
function mechanicsFor(r: () => number, n: number): Mechanic[] {
  const all = Object.keys(MECHANIC_INTRO) as Mechanic[];
  const intro = all.find((m) => MECHANIC_INTRO[m] === n);
  if (intro) return [intro];
  const known = all.filter((m) => MECHANIC_INTRO[m] < n);
  const max = n > 40 ? 3 : 2;
  const out: Mechanic[] = [];
  for (const m of shuffle(r, known)) if (out.length < max && r() < 0.5) out.push(m);
  // levels with mechanics never go long without one
  if (!out.length && known.length && r() < 0.8) out.push(known[Math.floor(r() * known.length)]);
  return out;
}

/** Add mechanics to a layout (bomb counters are set after a first solve). */
function applyMechanics(r: () => number, def: LevelDef, mech: Mechanic[], intro: boolean): boolean {
  const probe = new Puzzle(def);
  const modOf = (sid: number) => {
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
  const plainPlank = (i: number) => def.planks[i].lock === undefined && def.planks[i].chain === undefined && !def.planks[i].sticky;
  const ids = shuffle(r, probe.screws.map((s) => s.id));
  const topLayer = Math.max(...def.planks.map((p) => p.layer));
  for (const m of mech) {
    if (m === 'ice') {
      const pool = ids.filter((k) => plain(k) && (!intro || probe.isUncovered(k)));
      const n = intro ? 3 : 1 + Math.floor(r() * 3);
      if (pool.length < n) return false;
      for (const k of pool.slice(0, n)) modOf(k).ice = 1;
    } else if (m === 'hidden') {
      const pool = ids.filter((k) => plain(k) && !probe.isUncovered(k));
      const n = intro ? 2 : 1 + Math.floor(r() * 2);
      if (pool.length < n) return false;
      for (const k of pool.slice(0, n)) modOf(k).hidden = 1;
    } else if (m === 'lock') {
      // a locked plank, and its key screw on another plank (in plain sight on the intro level)
      const planks = shuffle(r, def.planks.map((_, i) => i)).filter(plainPlank);
      let done = false;
      for (const pi of planks) {
        const key = ids.find((k) => plain(k) && probe.screws[k].plank !== pi && (!intro || probe.isUncovered(k)));
        if (key === undefined) continue;
        def.planks[pi].lock = 0;
        modOf(key).key = 0;
        done = true;
        break;
      }
      if (!done) return false;
    } else if (m === 'chain') {
      const order = shuffle(r, def.planks.map((_, i) => i)).filter(plainPlank);
      let done = false;
      for (const a of order) {
        for (const b of order) {
          if (a >= b || def.planks[a].layer !== def.planks[b].layer) continue;
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
      // a plank on top, all its screws in plain sight, at least 3 of them
      const cands = def.planks.map((p, i) => ({ p, i })).filter(({ p, i }) => p.layer === topLayer && plainPlank(i) && p.screws.length >= 3 && probe.planks[i].screws.every((k) => probe.isUncovered(k) && plain(k)));
      if (!cands.length) return false;
      def.planks[cands[Math.floor(r() * cands.length)].i].sticky = 1;
    }
  }
  return true;
}

/** Bomb screw: counter = the taps the winning line needs to take it out, plus a little slack. */
function addBomb(r: () => number, def: LevelDef, slackMax: number): boolean {
  const res = analyze(new Puzzle(def), 120_000);
  if (!res.solvable) return false;
  const probe = new Puzzle(def);
  const plain = probe.screws.filter((s) => {
    const m = def.planks[s.plank].mods?.[probe.planks[s.plank].screws.indexOf(s.id)];
    return !m || Object.keys(m).length === 0;
  });
  // prefer a screw the line takes out in the middle: early enough to matter, late enough to tick down
  const p = new Puzzle(def);
  const when = new Map<number, number>();
  for (const m of res.winPath) {
    p.tap(m);
    if (p.removed[m]) when.set(m, p.taps);
  }
  const cands = plain.filter((s) => (when.get(s.id) ?? 0) >= 4).sort(() => r() - 0.5);
  if (!cands.length) return false;
  const s = cands[0];
  const pl = def.planks[s.plank];
  pl.mods ??= pl.screws.map(() => null);
  pl.mods[probe.planks[s.plank].screws.indexOf(s.id)] = { bomb: when.get(s.id)! + 1 + Math.floor(r() * slackMax) };
  return true;
}

/** How far a level is from its targets (0 = all met). Unsolvable or unfinished: huge. */
export function score(def: LevelDef, band: Band, games: number): { score: number; fail: number } {
  const tg = targetFor(def.id);
  const a = analyze(new Puzzle(def), 120_000);
  if (!a.complete || !a.solvable) return { score: 100, fail: 1 };
  const fail = randomFailRate(def, games, 11);
  const fPen = fail < band.fail[0] ? band.fail[0] - fail : fail > band.fail[1] ? fail - band.fail[1] : 0;
  // no trap yet: steer towards a tighter tray budget (a trap needs the best line to use the whole tray)
  let tPen = 0;
  if (a.trapScrews.length < tg.traps) tPen = 0.5;
  const dPen = Math.max(0, tg.decisions - a.decisions) * 0.15;
  const mPen = a.minMoves < tg.moves[0] || a.minMoves > tg.moves[1] ? 1 : 0;
  // early levels: the first decision comes within the first taps, and the "obvious" bot must fail often enough
  let ePen = 0;
  if (tg.firstDecision) ePen += a.firstDecision === 0 ? 0.6 : Math.max(0, a.firstDecision - tg.firstDecision) * 0.08;
  if (tg.greedyFail) ePen += Math.max(0, tg.greedyFail - greedyFailRate(def, games, 13)) * 2;
  return { score: fPen * 4 + tPen + dPen + mPen + ePen, fail };
}

/**
 * Local search over the colouring: swap the colours of two screws, or two boxes in the queue, and keep the
 * change when the level gets closer to its targets.
 */
export function tuneColors(r: () => number, def: LevelDef, band: Band, iters: number, frozen = new Set<string>(), queueFixed = 0): boolean {
  const cells = def.planks.flatMap((p, pi) => p.screws.map((_, si) => [pi, si] as const)).filter(([pi, si]) => !frozen.has(`${pi}:${si}`));
  let cur = score(def, band, 150);
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
        if (q.length - queueFixed < 2) continue;
        const a = queueFixed + Math.floor(r() * (q.length - queueFixed));
        const b = queueFixed + Math.floor(r() * (q.length - queueFixed));
        if (q[a] === q[b]) continue;
        [q[a], q[b]] = [q[b], q[a]];
        undo.push(() => ([q[a], q[b]] = [q[b], q[a]]));
      }
    }
    if (!undo.length) continue;
    const next = score(def, band, 150);
    if (next.score <= cur.score) cur = next;
    else for (const u of undo.reverse()) u();
  }
  return cur.score === 0;
}

/**
 * "Obvious" bot: always taps a screw that goes straight into an active box when there is one (else any free
 * screw). Its failure rate shows how often the obvious move is the wrong one.
 */
export function greedyFailRate(def: LevelDef, games = 1000, seed = 5): number {
  const r = rng(seed);
  let fails = 0;
  for (let g = 0; g < games; g++) {
    const p = new Puzzle(def);
    while (p.status === 'play') {
      const free = p.freeScrews();
      if (!free.length) break;
      const obvious = free.filter((s) => !p.iced[s] && p.boxFor(p.screws[s].color) >= 0);
      const pool = obvious.length ? obvious : free;
      p.tap(pool[Math.floor(r() * pool.length)]);
    }
    if (p.status !== 'won') fails++;
  }
  return fails / games;
}

/** Random-tapping bot failure rate (a random removable screw each tap; fixed seed: the audit reproduces it). */
export function randomFailRate(def: LevelDef, games = 1000, seed = 7): number {
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

export function generateLevel(n: number, seed = n * 7919, maxTries = 3000): Generated {
  const band = bandFor(n);
  const tg = targetFor(n);
  const r = rng(seed);
  for (let tries = 1; tries <= maxTries; tries++) {
    const look = EARLY_LOOKS[n];
    const planks = makeLayout(r, band, look);
    if (!planks) {
      rej('layout');
      continue;
    }
    if (!fitScrews(planks, band.screws[0], band.screws[1])) {
      rej('screws');
      continue;
    }
    center(planks);
    const queue = colorize(r, planks, pick(r, band.colors), look?.palette);
    if (!queue) {
      rej('colours');
      continue;
    }
    const def: LevelDef = {
      id: n, object: OBJECTS[(n - 1) % OBJECTS.length], pet: PETS[(n - 1) % PETS.length],
      open: OPEN_BOXES, tray: tg.tray, planks, queue,
    };
    if (n <= 2) def.tutorial = true;
    const mech = mechanicsFor(r, n);
    if (!applyMechanics(r, def, mech, MECHANIC_INTRO[mech[0]] === n)) {
      rej('mechanics');
      continue;
    }
    if (validateLevel(def).length) {
      rej('invalid');
      continue;
    }
    // cheap screen before tuning: very far from the band is not worth tuning
    const quick = randomFailRate(def, 60, seed + tries);
    if (quick < band.fail[0] - 0.35 || quick > band.fail[1] + 0.35) {
      rej('quick');
      continue;
    }
    if (mech.includes('bomb') && !addBomb(r, def, tg.tier === 'veryhard' || tg.tier === 'hard' ? 3 : 5)) {
      rej('bomb');
      continue;
    }
    if (!tuneColors(r, def, band, 120)) {
      rej('tune');
      continue;
    }
    const a = analyze(new Puzzle(def), 600_000);
    if (!a.complete || !a.solvable || a.trapScrews.length < tg.traps || a.decisions < tg.decisions || a.minMoves < tg.moves[0] || a.minMoves > tg.moves[1]) {
      rej('verify');
      continue;
    }
    if (tg.firstDecision && (a.firstDecision === 0 || a.firstDecision > tg.firstDecision)) {
      rej('late decision');
      continue;
    }
    if (greedyFailRate(def) < tg.greedyFail) {
      rej('obvious wins');
      continue;
    }
    const failRate = randomFailRate(def);
    if (failRate < band.fail[0] || failRate > band.fail[1]) {
      rej(failRate < band.fail[0] ? 'too easy' : 'too hard');
      continue;
    }
    return { def, failRate, tries };
  }
  throw new Error(`level ${n}: no candidate met the band ${JSON.stringify(band)} (${JSON.stringify(rejects)})`);
}

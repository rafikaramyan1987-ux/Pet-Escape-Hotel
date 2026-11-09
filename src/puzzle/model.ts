import type { PetKind } from '../art/pets';

/**
 * Screw & Rescue puzzle model (pure, deterministic, no rendering).
 *
 * A level is the front of a 3D object (crate, cage, kennel…) covered by planks. Each plank is held by
 * coloured screws. Tapping a free screw sends it to the open toolbox of its colour (3 screws per box), or
 * to the holding tray when no such box is open. A full box closes and the next box in the queue opens,
 * pulling matching screws out of the tray. A plank falls when its last screw is out. A screw is free only
 * when no plank on a higher layer covers it. Run out of tray space: level failed. All planks gone: the pet
 * inside is rescued.
 *
 * Mechanics mixed in as levels progress:
 *  - ice: the first tap breaks the ice, the second unscrews
 *  - hidden "?": the colour shows only once the screw is free (no plank above it)
 *  - chained planks: they fall together, only when every plank of the chain has lost its screws
 *  - lock / key: a locked screw can be taken only after the key screw with the same symbol is out
 *  - bomb plank: a counter of N taps; if it runs out before the plank falls, the level is lost
 *  - sticky tray slot: one slot that only accepts one colour
 *
 * Coordinates: the front plane of the object, x right, y up, in world units (the opening is ~3.4 × 2.8).
 */
export const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink', 'teal'] as const;
export type Color = (typeof COLORS)[number];
export type ObjectKind = 'crate' | 'cage' | 'kennel' | 'carrier' | 'toybox';

export const BOX_SIZE = 3;
export const SCREW_R = 0.26;
export const PLANK_W = 0.72;

/** Per-screw modifiers (aligned with PlankSpec.screws). */
export interface ScrewMod {
  ice?: 1;
  hidden?: 1;
  /** Locked until the key screw with the same symbol (0–3) is out. */
  lock?: number;
  /** This screw is the key for symbol n. */
  key?: number;
}

export interface PlankSpec {
  x: number;
  y: number;
  len: number;
  /** Degrees, counter-clockwise. */
  angle: number;
  layer: number;
  /** Screw colours, spread evenly along the plank. */
  screws: Color[];
  /** Pastel paint index (cosmetic). */
  tint?: number;
  mods?: (ScrewMod | null)[];
  /** Planks with the same chain id fall together. */
  chain?: number;
  /** Bomb plank: taps allowed before it must have fallen. */
  bomb?: number;
}

export interface LevelDef {
  id: number;
  object: ObjectKind;
  pet: PetKind;
  planks: PlankSpec[];
  /** Toolbox colours in the order they arrive. */
  queue: Color[];
  /** Toolboxes open at the same time. */
  open: number;
  /** Holding tray slots. */
  tray: number;
  /** One tray slot that only accepts one colour. */
  sticky?: { slot: number; color: Color };
  tutorial?: boolean;
}

export type LoseReason = 'tray' | 'bomb' | 'stuck';

export type Action = { t: 'tap'; id: number } | { t: 'slot' } | { t: 'hammer'; plank: number };

export interface Screw {
  id: number;
  plank: number;
  color: Color;
  x: number;
  y: number;
  layer: number;
  ice: boolean;
  hidden: boolean;
  lock: number;
  key: number;
}

export interface Plank {
  id: number;
  spec: PlankSpec;
  screws: number[];
}

export interface Box {
  /** Unique per box instance (the view animates instances). */
  uid: number;
  color: Color;
  screws: number[];
}

export type PuzzleEvent =
  | { type: 'toBox'; screw: number; box: number; uid: number; slot: number }
  | { type: 'toTray'; screw: number; slot: number }
  | { type: 'trayToBox'; screw: number; from: number; box: number; uid: number; slot: number }
  | { type: 'boxFull'; box: number; uid: number }
  | { type: 'boxOpen'; box: number; uid: number; color: Color }
  | { type: 'plankFall'; plank: number }
  | { type: 'hammer'; plank: number; screws: number[] }
  | { type: 'ghostToBox'; color: Color; box: number; uid: number; slot: number }
  | { type: 'traySlot'; slots: number }
  | { type: 'ice'; screw: number }
  | { type: 'reveal'; screw: number }
  | { type: 'unlock'; screw: number }
  | { type: 'won' }
  | { type: 'lost'; reason: LoseReason; plank?: number };

/** Build planks and screws (positions) from a level definition. */
export function buildLevel(def: LevelDef): { planks: Plank[]; screws: Screw[] } {
  const planks: Plank[] = [];
  const screws: Screw[] = [];
  def.planks.forEach((spec, pi) => {
    const a = (spec.angle * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const n = spec.screws.length;
    const inset = 0.42;
    const ids: number[] = [];
    spec.screws.forEach((color, i) => {
      const t = n === 1 ? 0 : -spec.len / 2 + inset + ((spec.len - 2 * inset) * i) / (n - 1);
      const id = screws.length;
      const m = spec.mods?.[i] ?? null;
      screws.push({
        id, plank: pi, color, x: spec.x + ux * t, y: spec.y + uy * t, layer: spec.layer,
        ice: !!m?.ice, hidden: !!m?.hidden, lock: m?.lock ?? -1, key: m?.key ?? -1,
      });
      ids.push(id);
    });
    planks.push({ id: pi, spec, screws: ids });
  });
  return { planks, screws };
}

/** Is point (px, py) on plank `p` (with a margin)? */
export function plankCovers(p: PlankSpec, px: number, py: number, margin = SCREW_R * 0.75): boolean {
  const a = (-p.angle * Math.PI) / 180;
  const dx = px - p.x;
  const dy = py - p.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= p.len / 2 + margin && Math.abs(ly) <= PLANK_W / 2 + margin;
}

export class Puzzle {
  readonly def: LevelDef;
  readonly planks: Plank[];
  readonly screws: Screw[];
  /** For each screw: the planks above it that cover it. */
  private coveredBy: number[][];
  removed: boolean[];
  plankGone: boolean[];
  boxes: (Box | null)[];
  tray: (number | null)[];
  next: number;
  status: 'play' | 'won' | 'lost' = 'play';
  private uid = 0;
  /** Every action so far (taps and boosters), so a state can be rebuilt for undo. */
  history: Action[] = [];
  /** Hammered screws not yet counted in a box (a box of that colour opens later). */
  credit: Partial<Record<Color, number>> = {};
  /** Screws still under ice. */
  iced: boolean[];
  /** Taps so far (bomb counters run down with every tap). */
  taps = 0;
  /** Colour each tray slot accepts (null = any). */
  trayColor: (Color | null)[];
  /** For each locked screw: its key screw. */
  private keyOf: number[];
  private hasIce: boolean;
  private hasBomb: boolean;
  /** Hidden and locked screws (watched for reveal / unlock events). */
  private watch: number[];

  constructor(def: LevelDef) {
    this.def = def;
    const { planks, screws } = buildLevel(def);
    this.planks = planks;
    this.screws = screws;
    this.coveredBy = screws.map((s) => planks.filter((p) => p.spec.layer > s.layer && plankCovers(p.spec, s.x, s.y)).map((p) => p.id));
    this.removed = screws.map(() => false);
    this.plankGone = planks.map(() => false);
    this.tray = Array.from({ length: def.tray }, () => null);
    this.trayColor = this.tray.map((_, i) => (def.sticky && def.sticky.slot === i ? def.sticky.color : null));
    this.iced = screws.map((x) => x.ice);
    this.keyOf = screws.map((x) => (x.lock >= 0 ? screws.findIndex((k) => k.key === x.lock) : -1));
    this.hasIce = this.iced.some(Boolean);
    this.hasBomb = def.planks.some((p) => p.bomb !== undefined);
    this.watch = screws.filter((x) => x.hidden || x.lock >= 0).map((x) => x.id);
    this.boxes = [];
    this.next = 0;
    for (let i = 0; i < def.open; i++) this.boxes.push(this.nextBox());
  }

  private nextBox(): Box | null {
    if (this.next >= this.def.queue.length) return null;
    return { uid: ++this.uid, color: this.def.queue[this.next++], screws: [] };
  }

  clone(): Puzzle {
    const c = Object.create(Puzzle.prototype) as Puzzle;
    Object.assign(c, this);
    c.removed = this.removed.slice();
    c.plankGone = this.plankGone.slice();
    c.boxes = this.boxes.map((b) => (b ? { ...b, screws: b.screws.slice() } : null));
    c.tray = this.tray.slice();
    c.history = this.history.slice();
    c.credit = { ...this.credit };
    c.iced = this.iced.slice();
    c.trayColor = this.trayColor.slice();
    return c;
  }

  /** Not under a plank (its colour is visible even when it is hidden "?" and locked). */
  isUncovered(id: number): boolean {
    return this.coveredBy[id].every((p) => this.plankGone[p]);
  }

  isLocked(id: number): boolean {
    const k = this.keyOf[id];
    return k >= 0 && !this.removed[k];
  }

  isFree(id: number): boolean {
    if (this.removed[id]) return false;
    return this.isUncovered(id) && !this.isLocked(id);
  }

  /** Taps left on a bomb plank (Infinity when it is not a bomb or already fell). */
  bombLeft(plank: number): number {
    const b = this.planks[plank].spec.bomb;
    if (b === undefined || this.plankGone[plank]) return Infinity;
    return b - this.taps;
  }

  /** Tray slot a screw of this colour would go to (-1: none). Sticky slots take their colour first. */
  slotFor(color: Color): number {
    for (let i = 0; i < this.tray.length; i++) if (this.tray[i] === null && this.trayColor[i] === color) return i;
    for (let i = 0; i < this.tray.length; i++) if (this.tray[i] === null && this.trayColor[i] === null) return i;
    return -1;
  }

  private boxFor(color: Color): number {
    return this.boxes.findIndex((b) => b && b.color === color && b.screws.length < BOX_SIZE);
  }

  /** Can this free screw be tapped without losing right away? */
  canTakeSafely(id: number): boolean {
    if (this.iced[id]) return true;
    const c = this.screws[id].color;
    return this.boxFor(c) >= 0 || this.slotFor(c) >= 0;
  }

  freeScrews(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.screws.length; i++) if (this.isFree(i)) out.push(i);
    return out;
  }

  trayCount(): number {
    return this.tray.filter((t) => t !== null).length;
  }

  /** Tap a screw. Returns what happened, in order (empty when the tap is not allowed). */
  tap(id: number): PuzzleEvent[] {
    if (this.status !== 'play' || !this.isFree(id)) return [];
    const ev: PuzzleEvent[] = [];
    const s = this.screws[id];
    this.history.push({ t: 'tap', id });
    this.taps++;
    if (this.iced[id]) {
      this.iced[id] = false;
      ev.push({ type: 'ice', screw: id });
      this.afterTap(ev);
      return ev;
    }
    const wasFree = this.watch.map((k) => this.isFree(k));
    this.removed[id] = true;
    const bi = this.boxFor(s.color);
    if (bi >= 0) {
      const b = this.boxes[bi]!;
      b.screws.push(id);
      ev.push({ type: 'toBox', screw: id, box: bi, uid: b.uid, slot: b.screws.length - 1 });
      this.settleBoxes(ev);
    } else {
      const slot = this.slotFor(s.color);
      if (slot < 0) {
        // no room anywhere: the level is lost (the screw stays out, nowhere to go)
        this.status = 'lost';
        ev.push({ type: 'lost', reason: 'tray' });
        return ev;
      }
      this.tray[slot] = id;
      ev.push({ type: 'toTray', screw: id, slot });
    }
    this.dropPlanks(s.plank, ev);
    for (let w = 0; w < this.watch.length; w++) {
      const k = this.watch[w];
      if (wasFree[w] || !this.isFree(k)) continue;
      if (this.screws[k].hidden) ev.push({ type: 'reveal', screw: k });
      if (this.screws[k].lock >= 0 && this.keyOf[k] === id) ev.push({ type: 'unlock', screw: k });
    }
    this.afterTap(ev);
    return ev;
  }

  /** A plank falls when its screws are out, and a chained plank only together with the rest of its chain. */
  private dropPlanks(plank: number, ev: PuzzleEvent[]): void {
    const spec = this.planks[plank].spec;
    const group = spec.chain === undefined ? [plank] : this.planks.filter((p) => p.spec.chain === spec.chain).map((p) => p.id);
    const empty = (i: number) => this.plankGone[i] || this.planks[i].screws.every((k) => this.removed[k]);
    if (!group.every(empty)) return;
    for (const i of group) {
      if (this.plankGone[i]) continue;
      this.plankGone[i] = true;
      ev.push({ type: 'plankFall', plank: i });
    }
  }

  /** Win, bomb and stuck checks after every tap. */
  private afterTap(ev: PuzzleEvent[]): void {
    if (this.plankGone.every(Boolean)) {
      this.status = 'won';
      ev.push({ type: 'won' });
      return;
    }
    for (const p of this.planks) {
      if (this.bombLeft(p.id) <= 0) {
        this.status = 'lost';
        ev.push({ type: 'lost', reason: 'bomb', plank: p.id });
        return;
      }
    }
    const free = this.freeScrews();
    if (!free.some((k) => this.canTakeSafely(k))) {
      // nothing can be taken without overflowing the tray (or nothing is free at all): stuck
      this.status = 'lost';
      ev.push({ type: 'lost', reason: free.length ? 'tray' : 'stuck' });
    }
  }

  /** Close full boxes, open the next ones, and pull matching screws from the tray. */
  private settleBoxes(ev: PuzzleEvent[]): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i];
        if (b && b.screws.length >= BOX_SIZE) {
          ev.push({ type: 'boxFull', box: i, uid: b.uid });
          const nb = this.nextBox();
          this.boxes[i] = nb;
          if (nb) ev.push({ type: 'boxOpen', box: i, uid: nb.uid, color: nb.color });
          changed = true;
        }
      }
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i];
        if (!b) continue;
        while ((this.credit[b.color] ?? 0) > 0 && b.screws.length < BOX_SIZE) {
          this.credit[b.color]!--;
          b.screws.push(-1);
          ev.push({ type: 'ghostToBox', color: b.color, box: i, uid: b.uid, slot: b.screws.length - 1 });
          changed = true;
        }
        for (let t = 0; t < this.tray.length && b.screws.length < BOX_SIZE; t++) {
          const sid = this.tray[t];
          if (sid !== null && this.screws[sid].color === b.color) {
            this.tray[t] = null;
            b.screws.push(sid);
            ev.push({ type: 'trayToBox', screw: sid, from: t, box: i, uid: b.uid, slot: b.screws.length - 1 });
            changed = true;
          }
        }
      }
    }
  }

  /** Booster: one more tray slot for this level. */
  addTraySlot(): PuzzleEvent[] {
    if (this.status !== 'play') return [];
    this.tray.push(null);
    this.history.push({ t: 'slot' });
    return [{ type: 'traySlot', slots: this.tray.length }];
  }

  /** Booster: smash a plank. Its screws count towards their colour's boxes (now, or when that box opens). */
  hammer(plank: number): PuzzleEvent[] {
    if (this.status !== 'play' || this.plankGone[plank]) return [];
    const p = this.planks[plank];
    const ev: PuzzleEvent[] = [];
    const ids = p.screws.filter((k) => !this.removed[k]);
    this.history.push({ t: 'hammer', plank });
    ev.push({ type: 'hammer', plank, screws: ids });
    for (const k of ids) {
      this.removed[k] = true;
      const c = this.screws[k].color;
      this.credit[c] = (this.credit[c] ?? 0) + 1;
    }
    this.plankGone[plank] = true;
    this.settleBoxes(ev);
    ev.push({ type: 'plankFall', plank });
    // a chained partner whose screws are already out comes down with it
    for (const p of this.planks) if (!this.plankGone[p.id] && p.spec.chain !== undefined && p.spec.chain === this.planks[plank].spec.chain) this.dropPlanks(p.id, ev);
    if (this.plankGone.every(Boolean)) {
      this.status = 'won';
      ev.push({ type: 'won' });
    }
    return ev;
  }

  /** Replay a list of actions on a fresh puzzle (undo = replay all but the last tap). */
  static replay(def: LevelDef, actions: Action[]): Puzzle {
    const p = new Puzzle(def);
    for (const a of actions) {
      if (a.t === 'tap') p.tap(a.id);
      else if (a.t === 'slot') p.addTraySlot();
      else p.hammer(a.plank);
    }
    return p;
  }

  /** History without the last `n` taps (boosters stay used). null when there is no tap to undo. */
  undoActions(n = 1): Action[] | null {
    const taps = this.history.map((a, i) => (a.t === 'tap' ? i : -1)).filter((i) => i >= 0);
    if (!taps.length) return null;
    const drop = new Set(taps.slice(-n));
    return this.history.filter((_, i) => !drop.has(i));
  }

  /** Canonical key of the gameplay-relevant state (for the solver). */
  key(): string {
    let k = '';
    for (const r of this.removed) k += r ? '1' : '0';
    k += `|${this.next}|`;
    for (const b of this.boxes) k += b ? `${b.color[0]}${b.color[1]}${b.screws.length},` : '-,';
    if (this.hasIce) for (const r of this.iced) k += r ? 'i' : '.';
    const tray = this.tray.filter((t, i) => t !== null && this.trayColor[i] === null).map((t) => this.screws[t!].color).sort();
    k += tray.join('');
    if (this.def.sticky) k += `|${this.tray[this.def.sticky.slot] === null ? '' : 's'}`;
    if (this.hasBomb) k += `|t${this.taps}`;
    return k + (this.tray.length !== this.def.tray ? `#${this.tray.length}` : '');
  }
}

/** Sanity checks every level must pass. */
export function validateLevel(def: LevelDef): string[] {
  const problems: string[] = [];
  const count = new Map<Color, number>();
  for (const p of def.planks) for (const c of p.screws) count.set(c, (count.get(c) ?? 0) + 1);
  const boxes = new Map<Color, number>();
  for (const c of def.queue) boxes.set(c, (boxes.get(c) ?? 0) + 1);
  for (const [c, n] of count) {
    if (n % BOX_SIZE !== 0) problems.push(`${n} ${c} screws (not a multiple of ${BOX_SIZE})`);
    if ((boxes.get(c) ?? 0) * BOX_SIZE !== n) problems.push(`${c}: ${n} screws but ${(boxes.get(c) ?? 0)} boxes`);
  }
  for (const c of boxes.keys()) if (!count.has(c)) problems.push(`box for ${c} with no ${c} screws`);
  if (!def.planks.length) problems.push('no planks');
  for (const p of def.planks) {
    if (!p.screws.length) problems.push('plank without screws');
    if (p.mods && p.mods.length !== p.screws.length) problems.push('mods do not match the screws');
  }
  const mods = def.planks.flatMap((p) => p.mods ?? []);
  for (const m of mods) if (m?.lock !== undefined && !mods.some((k) => k?.key === m.lock)) problems.push(`lock ${m.lock} without a key`);
  const chains = new Map<number, number>();
  for (const p of def.planks) if (p.chain !== undefined) chains.set(p.chain, (chains.get(p.chain) ?? 0) + 1);
  for (const [c, n] of chains) if (n < 2) problems.push(`chain ${c} has one plank`);
  if (def.sticky && (def.sticky.slot >= def.tray || !count.has(def.sticky.color))) problems.push('bad sticky slot');
  return problems;
}
